# Data Model

This document specifies the PostgreSQL data model for Axentra, implemented with Drizzle ORM in
`packages/db`.

The schema entrypoint is:

```text
packages/db/src/schema/index.ts
```

## Implemented Database Boundary

| Concern           | Status      | Description                                                                      |
| ----------------- | ----------- | -------------------------------------------------------------------------------- |
| PostgreSQL client | Implemented | `postgres` connection pool via `createDatabaseClient`                            |
| Drizzle boundary  | Implemented | Type-safe schema definitions and relation mappings in `@axentra/db`              |
| Migration runner  | Implemented | Standalone runner in `src/migrate.ts` executing committed SQL                    |
| Health check      | Implemented | Ping query (`SELECT 1`) validating database readiness                            |
| Document core     | Implemented | 8 domain tables covering documents, files, metadata, categories, tags (DB-S1-01) |
| Identity/Users    | Deferred    | User & session tables deferred in Sprint 1 (dev auth used)                       |
| Audit trail       | Planned     | `download_audit_events` planned in subsequent cards                              |

## Table Conventions

- Table names use plural `snake_case`.
- Column names use `snake_case`.
- Primary keys are UUID generated via `defaultRandom()` (`gen_random_uuid()`).
- Timestamps use `timestamp({ withTimezone: true, mode: "date" })` (`timestamptz`).
- Mutable records include `created_at` and `updated_at`. Point-in-time facts include `created_at`.
- Foreign keys specify explicit `onDelete` behavior (`cascade` or `set null`).
- Applied shared migrations are immutable; any forward schema changes use new migration files.

## Document Core Schema (DB-S1-01)

### Entity-Relationship Overview

```text
categories (1) <--- (0..1) category_download_permissions
    ^
    | (0..1)
documents (1) <--- (1)    document_files
          (1) <--- (1)    document_metadata
          (1) <--- (0..*) document_content_hashes
          (1) <--- (0..*) document_smart_tags (0..*) ---> (1) smart_tags
```

### Table Definitions

#### 1. `documents`

The central business record for an uploaded document.

| Column              | Type                | Constraints                              | Description                                     |
| ------------------- | ------------------- | ---------------------------------------- | ----------------------------------------------- |
| `id`                | `uuid`              | Primary Key, default random              | Document identifier                             |
| `title`             | `text`              | NOT NULL                                 | Document title (defaults to filename on upload) |
| `category_id`       | `uuid`              | FK -> `categories.id` ON DELETE SET NULL | Assigned category (null if uncategorized)       |
| `processing_status` | `processing_status` | NOT NULL, DEFAULT `'queued'`             | Current processing status                       |
| `error_message`     | `text`              | Nullable                                 | Error message if processing fails               |
| `created_at`        | `timestamptz`       | NOT NULL, default now()                  | Creation timestamp                              |
| `updated_at`        | `timestamptz`       | NOT NULL, default now()                  | Last modification timestamp                     |
| `deleted_at`        | `timestamptz`       | Nullable                                 | Soft-delete timestamp (null when active)        |

**Indexes:**

- `documents_processing_status_idx` on `(processing_status)`
- `documents_category_id_idx` on `(category_id)`
- `documents_created_at_idx` on `(created_at)`

#### 2. `document_files`

The physical binary object reference in S3-compatible storage.

> [!IMPORTANT]
> **Cardinality Invariant (1:1):** Axentra enforces strictly one original stored file per document in the initial implementation. This is guaranteed by a `UNIQUE` index on `document_id`.

| Column           | Type          | Constraints                            | Description                                      |
| ---------------- | ------------- | -------------------------------------- | ------------------------------------------------ |
| `id`             | `uuid`        | Primary Key, default random            | File record identifier                           |
| `document_id`    | `uuid`        | NOT NULL, FK -> `documents.id` CASCADE | Owning document identifier                       |
| `storage_key`    | `text`        | NOT NULL                               | S3/MinIO object key                              |
| `original_name`  | `text`        | NOT NULL                               | Original uploaded filename                       |
| `mime_type`      | `text`        | NOT NULL                               | MIME type (e.g., `application/pdf`)              |
| `file_size`      | `bigint`      | NOT NULL                               | Size in bytes                                    |
| `file_extension` | `text`        | NOT NULL                               | File extension without dot (e.g., `pdf`, `docx`) |
| `created_at`     | `timestamptz` | NOT NULL, default now()                | Creation timestamp                               |
| `updated_at`     | `timestamptz` | NOT NULL, default now()                | Modification timestamp                           |

**Indexes:**

- `document_files_document_id_unique_idx` UNIQUE on `(document_id)` — enforces 1:1 invariant.
- `document_files_storage_key_idx` on `(storage_key)`

#### 3. `document_content_hashes`

Cryptographic content hashes for duplicate detection (AC-02.01, AC-02.02).

| Column           | Type          | Constraints                            | Description                           |
| ---------------- | ------------- | -------------------------------------- | ------------------------------------- |
| `id`             | `uuid`        | Primary Key, default random            | Hash record identifier                |
| `document_id`    | `uuid`        | NOT NULL, FK -> `documents.id` CASCADE | Document possessing this content hash |
| `hash_algorithm` | `text`        | NOT NULL, DEFAULT `'sha256'`           | Hash algorithm (e.g., `sha256`)       |
| `content_hash`   | `text`        | NOT NULL                               | Hex-encoded content hash string       |
| `created_at`     | `timestamptz` | NOT NULL, default now()                | Creation timestamp                    |

**Indexes:**

- `document_content_hashes_hash_algo_unique_idx` UNIQUE on `(content_hash, hash_algorithm)` — prevents persisting duplicate content.
- `document_content_hashes_document_id_idx` on `(document_id)`

#### 4. `document_metadata`

Structured metadata extracted from document contents (AC-03.01).

| Column         | Type          | Constraints                            | Description                                |
| -------------- | ------------- | -------------------------------------- | ------------------------------------------ |
| `id`           | `uuid`        | Primary Key, default random            | Metadata record identifier                 |
| `document_id`  | `uuid`        | NOT NULL, FK -> `documents.id` CASCADE | Owning document identifier (1:1)           |
| `author`       | `text`        | Nullable                               | Extracted author name                      |
| `raw_metadata` | `jsonb`       | Nullable                               | Raw provider or extracted metadata payload |
| `extracted_at` | `timestamptz` | Nullable                               | When extraction took place                 |
| `created_at`   | `timestamptz` | NOT NULL, default now()                | Record creation timestamp                  |
| `updated_at`   | `timestamptz` | NOT NULL, default now()                | Record update timestamp                    |

**Indexes:**

- `document_metadata_document_id_unique_idx` UNIQUE on `(document_id)`
- `document_metadata_author_idx` on `(author)`

#### 5. `categories`

Document categorization (AC-05.01, AC-05.02).

| Column       | Type          | Constraints                 | Description                      |
| ------------ | ------------- | --------------------------- | -------------------------------- |
| `id`         | `uuid`        | Primary Key, default random | Category identifier              |
| `name`       | `text`        | NOT NULL                    | Display name (e.g., `Reporting`) |
| `slug`       | `text`        | NOT NULL                    | URL-friendly slug                |
| `created_at` | `timestamptz` | NOT NULL, default now()     | Creation timestamp               |
| `updated_at` | `timestamptz` | NOT NULL, default now()     | Update timestamp                 |

**Indexes:**

- `categories_name_unique_idx` UNIQUE on `(name)`
- `categories_slug_unique_idx` UNIQUE on `(slug)`

#### 6. `category_download_permissions`

Category-level download gating for Member Team managed by Head of Team (AC-13.01).

| Column             | Type          | Constraints                             | Description                                     |
| ------------------ | ------------- | --------------------------------------- | ----------------------------------------------- |
| `id`               | `uuid`        | Primary Key, default random             | Permission identifier                           |
| `category_id`      | `uuid`        | NOT NULL, FK -> `categories.id` CASCADE | Target category (1:1)                           |
| `download_enabled` | `boolean`     | NOT NULL, DEFAULT `false`               | Download toggle (defaults to inactive/disabled) |
| `created_at`       | `timestamptz` | NOT NULL, default now()                 | Creation timestamp                              |
| `updated_at`       | `timestamptz` | NOT NULL, default now()                 | Update timestamp                                |

**Indexes:**

- `category_download_permissions_category_id_unique_idx` UNIQUE on `(category_id)`

#### 7. `smart_tags`

System-generated Smart Tags extracted from document content (AC-04.01, AC-04.02).

| Column       | Type          | Constraints                 | Description                           |
| ------------ | ------------- | --------------------------- | ------------------------------------- |
| `id`         | `uuid`        | Primary Key, default random | Tag identifier                        |
| `name`       | `text`        | NOT NULL                    | Normalized tag name (e.g., `finance`) |
| `created_at` | `timestamptz` | NOT NULL, default now()     | Creation timestamp                    |

**Indexes:**

- `smart_tags_name_unique_idx` UNIQUE on `(name)`

#### 8. `document_smart_tags`

Many-to-many association between documents and Smart Tags.

| Column        | Type          | Constraints                             | Description            |
| ------------- | ------------- | --------------------------------------- | ---------------------- |
| `id`          | `uuid`        | Primary Key, default random             | Join record identifier |
| `document_id` | `uuid`        | NOT NULL, FK -> `documents.id` CASCADE  | Document reference     |
| `tag_id`      | `uuid`        | NOT NULL, FK -> `smart_tags.id` CASCADE | Tag reference          |
| `created_at`  | `timestamptz` | NOT NULL, default now()                 | Association timestamp  |

**Indexes:**

- `document_smart_tags_unique_idx` UNIQUE on `(document_id, tag_id)`
- `document_smart_tags_document_id_idx` on `(document_id)`
- `document_smart_tags_tag_id_idx` on `(tag_id)`

---

## Status Vocabularies

### Processing Status Enum (`processing_status`)

Persisted PostgreSQL enum and shared contract:

| State        | Meaning                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| `queued`     | Initial state upon upload acceptance; worker job enqueued.               |
| `processing` | Worker has picked up the job and is extracting metadata, tags, category. |
| `completed`  | Terminal success; metadata, files, tags, and category are persisted.     |
| `failed`     | Terminal failure; processing encountered an error (`error_message` set). |

---

## Deletion and Cascade Policy

- **Soft Delete on Documents:** `documents.deleted_at` tracks soft deletion. Queries filter by `deleted_at IS NULL`.
- **Hard Cascade:** If a `documents` row is deleted, foreign keys with `ON DELETE CASCADE` automatically clean up:
  - `document_files`
  - `document_content_hashes`
  - `document_metadata`
  - `document_smart_tags`
- **Category Cleanup:** Deleting a `categories` row sets `documents.category_id` to NULL (`ON DELETE SET NULL`), preserving the document, while deleting the corresponding `category_download_permissions` record (`ON DELETE CASCADE`).
- **Tag Cleanup:** Deleting a `smart_tags` row cascades only to `document_smart_tags`, leaving documents intact.
