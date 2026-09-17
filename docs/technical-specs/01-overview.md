# Overview

Axentra is an internal Document Management System. Foundation v0.1.0 ships the engineering
base only: Web, API, Worker, typed configuration, database boundary, queue boundary, storage
boundary, logging, tests, CI, and documentation.

The approved BA scope for future delivery covers Member Team and Head of Team flows for document
upload, duplicate prevention, metadata extraction, Smart Tags, auto categories, search, related
documents, preview, download, bulk download, analytics, download audit trail, and category-based
download permission.

## Goals

- Provide one Bun workspace for all deployable processes and shared packages.
- Keep Web, API, and Worker as separate runtime processes.
- Centralize environment parsing, logging, database access, queue access, and object storage.
- Expose operational health endpoints before any business module is added.
- Make future DMS features implementable without changing foundational contracts.

## Non-Goals

- No authentication flow is implemented in v0.1.0.
- No RBAC business rules are implemented in v0.1.0.
- No document upload, OCR, AI, search, preview, download, audit business flow, or domain schema
  is implemented in v0.1.0.
- No production deployment target is assigned in v0.1.0.

## Current Operational Surface

| Surface                     | Status      |
| --------------------------- | ----------- |
| Web shell                   | Implemented |
| API liveness                | Implemented |
| API readiness               | Implemented |
| Worker startup and shutdown | Implemented |
| PostgreSQL connection       | Implemented |
| Redis queue boundary        | Implemented |
| MinIO/S3 storage boundary   | Implemented |
| Business DMS modules        | Deferred    |
