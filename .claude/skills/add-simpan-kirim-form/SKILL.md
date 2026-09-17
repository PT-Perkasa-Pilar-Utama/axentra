---
name: add-simpan-kirim-form
description: Add a draft-and-submit form only when an Axentra task explicitly requires it.
---

# Draft and submit forms

This is an optional pattern, not a Foundation default. Use it only when the acceptance criteria explicitly require a local draft plus API submission.

- Keep draft key namespaced by feature and authenticated user.
- Store only non-sensitive, serializable form values; never store tokens, passwords, document bytes, or secrets in localStorage.
- Restore with Zod parsing and clear stale drafts after a successful submission.
- Simpan must be clearly separate from Kirim; Kirim must persist through the API and show pending, error, and success states.
- Add tests for restore, invalid draft, retry, duplicate submit, and successful persistence.

Use apps/web/src/lib/api-client.ts and shared contracts. Do not invent a form outside a task card.
