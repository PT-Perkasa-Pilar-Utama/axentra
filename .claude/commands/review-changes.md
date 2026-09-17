---
name: Review Changes
description: Perform a structured, risk-aware Axentra code review with evidence
---

# Review Changes

Review changes against the assigned card, Axentra contracts, and operational risk. A green build is
necessary but does not prove authorization, persistence, audit, or acceptance-criterion behavior.

## Review Steps

1. Read `CLAUDE.md`, the PR Task ID, linked User Story/ACs, and applicable docs.
2. Inspect `git status`, `git diff --stat`, and focused diffs before forming conclusions.
3. Trace changed behavior through Web, API, Worker, database, storage, and shared contracts as
   applicable.
4. Verify the change preserves:
   - API envelopes and documented endpoint contracts.
   - Server-side authorization, category permission, and audit requirements.
   - Safe configuration and secret redaction.
   - Migration immutability and queue payload compatibility.
   - Loading, empty, error, retry, denied, and success states for Web work.
5. Check affected tests. Identify missing tests by concrete behavior and acceptance criterion.
6. Run or inspect the relevant verification evidence. `bun run complete-check` is required before a
   normal implementation PR is approved.

## Findings Format

Group findings by risk level:

- **High:** release blocker, data-loss risk, authorization/security issue, broken contract, or
  unverified destructive operation.
- **Medium:** probable functional regression, missing critical test, incorrect state handling, or
  migration/worker compatibility risk.
- **Low:** maintainability, clarity, naming, or minor test/documentation improvement.

For each finding include file path and line, why it matters, evidence, and a specific remediation.
End with one recommendation: **Approve**, **Approve with follow-up**, or **Request changes**.

## Optional Knowledge-Graph Tools

If graph tooling exists, begin with `get_minimal_context(task="<task>")` and use
`detail_level="minimal"`. Then use `detect_changes`, `get_affected_flows`, tests-for queries, and
`get_impact_radius` to focus review effort. Do not invent graph output when those tools are absent.

## Efficiency Rules

- Review the change and its direct dependencies before scanning unrelated code.
- Keep findings evidence-backed; do not report style preferences as defects without a project rule.
- Separate pre-existing issues from issues introduced by the reviewed change.
