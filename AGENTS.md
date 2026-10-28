Read @CLAUDE.md

<!-- code-review-graph MCP tools -->

## MCP Tools: code-review-graph

**Important:** When `code-review-graph` is connected and healthy, use its MCP tools before
filesystem-wide exploration. The graph provides structural context such as callers, dependents,
affected flows, and test relationships. It complements rather than replaces runtime verification.

If the MCP server is unavailable, use the focused fallback in `.claude/commands/` and then set up
the graph with the Windows-friendly commands below:

```powershell
uv tool install code-review-graph
code-review-graph install
code-review-graph build
```

Restart the MCP client after installation. Do not claim graph evidence until the server is connected
and a graph tool returns a result.

### When to Use Graph Tools First

- **Exploring code:** `semantic_search_nodes` or `query_graph` before broad `rg` scans.
- **Understanding impact:** `get_impact_radius` before manually tracing imports.
- **Code review:** `detect_changes` and `get_review_context` before reading large unrelated files.
- **Finding relationships:** `query_graph` with callers, callees, imports, or tests patterns.
- **Architecture questions:** `get_architecture_overview` and `list_communities`.
- **Refactors:** `refactor_tool` preview and impact analysis before changing a public boundary.

Use `rg`, direct file reads, Git history, and tests when the graph does not cover the question, the
MCP server is unavailable, or runtime proof is needed.

### Key Tools

| Tool                        | Use when                                                   |
| --------------------------- | ---------------------------------------------------------- |
| `get_minimal_context`       | First graph call for any graph-assisted task               |
| `detect_changes`            | Reviewing changed code with risk scoring                   |
| `get_review_context`        | Reading focused source context for review                  |
| `get_impact_radius`         | Understanding blast radius of a change                     |
| `get_affected_flows`        | Finding affected execution paths                           |
| `query_graph`               | Tracing callers, callees, imports, tests, and dependencies |
| `semantic_search_nodes`     | Finding functions, classes, or code by keyword             |
| `get_architecture_overview` | Understanding high-level system structure                  |
| `refactor_tool`             | Previewing renames, dead code, and refactor suggestions    |

### Workflow

1. Start every graph-assisted task with `get_minimal_context(task="<task>")`.
2. Use `detail_level="minimal"` first; expand only if the result is insufficient.
3. For code review, use `detect_changes`, then inspect affected flows and test relationships.
4. For implementation, combine graph evidence with Axentra's documented contracts and relevant
   runtime verification.
