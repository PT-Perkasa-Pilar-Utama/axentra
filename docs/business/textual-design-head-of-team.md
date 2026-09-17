# Textual Design - Head of Team

Source: BA user stories and acceptance criteria. Figma is the visual reference; this document keeps
the functional text design.

## Analytics

Purpose: show adoption and usage metrics.

Expected metrics:

- Total documents in the system.
- Documents uploaded in the last 7 days.

## Audit Trail

Purpose: track document download activity.

Expected fields:

- User who downloaded the document.
- Document name.
- Download timestamp.

## Permission Category

Purpose: control Member Team download permission by category.

Expected behavior:

- Head of Team can toggle a category from inactive to active.
- When category permission is active, Member Team can download documents in that category.
- New auto-created categories do not receive download permission by default.
- Head of Team must explicitly activate download permission for new categories.
