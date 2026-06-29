# Architecture Decision Records (ADR)

Short, durable records of significant architecture decisions — the **context**, the
**decision**, and its **consequences**. Lightweight Nygard style. One file per
decision, named `NNNN-kebab-title.md`. Status flows
`Proposed → Accepted → Superseded by NNNN`.

An ADR captures *why* a decision was made so future readers don't re-litigate it.
For *what the product is* see [../scope.md](../product/scope.md); for *build order* see
[../roadmap.md](../product/roadmap.md); for *how the code is structured* see
[../technical/README.md](../technical/README.md).

| #    | Title                                                                 | Status   | Date       |
|------|-----------------------------------------------------------------------|----------|------------|
| 0001 | [MCP as the agent surface for task & project management](0001-mcp-as-agent-surface.md) | Accepted | 2026-06-14 |
| 0002 | [Optimistic updates for board/list mutations](0002-optimistic-updates.md) | Accepted | 2026-06-15 |
| 0003 | [Client read-cache + base ⊕ draft reconcile for entity detail](0003-client-read-cache-reconcile.md) | Accepted | 2026-06-27 |
