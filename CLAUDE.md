# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
bun install          # install dependencies
bun run run.ts       # run the agent (task is hardcoded in run.ts)
bun run test         # vitest suite
bunx vitest run agent/reflection_agent -t "test name"   # single test
```

Bun runtime, **ESM** (`"type": "module"`, no tsconfig — Bun handles TS natively). No build step, no linting. Tests via vitest.

## Environment

`.env` at project root:
```
LLM_APIKEY=<key>
MODEL_ID=glm-4.7   # optional, defaults to qwen3-coder-plus
```
OpenAI-compatible API at `https://api.z.ai/api/paas/v4` — switch `baseURL` in `util/llm_client.ts:8` for another provider.

## 目录结构 (Directory structure)

```
Agent/
├── run.ts                     # entry point: pick agent, register tools, call .run()
├── package.json               # ESM, Bun, vitest
├── .env                       # LLM_APIKEY, MODEL_ID
├── agent/                     # one dir per agent type: <name>.ts + <name>.md
│   ├── react_agent/           # ReactAgent
│   ├── plan_solve_agent/      # PlanSolveAgent
│   └── reflection_agent/      # ReflectionAgent (+ __tests__/)
├── util/                      # shared core (see Architecture)
├── .claude/
│   └── skills/                # *.md — model-followed slash-command docs
├── workspace/
│   └── sessions/              # <sessionId>.jsonl — persisted conversation history (runtime)
└── logs/
    └── app.log.jsonl          # structured run log (runtime)
```

`run.ts` is the only entry point. `workspace/sessions/` and `logs/` are runtime artifacts, not source.

## 系统架构 (Architecture)

ReAct framework: an agent loops think → act → observe, invoking tools until it returns a final text answer. All agents share the same core utilities and expose a `.toolExecutor` getter for registering tools before `.run()`.

**Agent types** (`agent/<name>/<name>.ts`):
- **`ReactAgent`** — single ReAct loop; stops when the model returns content without `tool_calls`.
- **`PlanSolveAgent`** — Planner (no tools) emits a JSON plan `{ plan: [{ step, description, expected_output }] }`; Executor runs one inner ReAct loop per step. History persists across steps.
- **`ReflectionAgent`** — Generate (ReAct) → Reflect (pure-LLM self-critique, JSON `{ pass, score, issues, suggestions, summary }`) → Revise (ReAct fed the reflection). Loops until reflection passes or `maxIterations` (default 3); inner ReAct bounded by `MAX_REACT_ITERATIONS = 15`. *This is the agent `run.ts` currently uses.*

**Core utilities** (`util/`):
- **`LLMClient`** — OpenAI SDK wrapper; `call(messages, tools)` → assistant message (may carry `tool_calls`).
- **`ToolExecutor`** — maps tool name → handler + definition; `callTool()` runs it and appends a `role: 'tool'` result. On error it appends the error instead of throwing, so the agent self-recovers.
- **`ConversationStore`** — JSONL history under `workspace/sessions/<sessionId>.jsonl` (save/load/list/delete); constructing with an existing `sessionId` auto-resumes.
- **`tools.ts` + `tool_definition.ts`** — built-in `read_file` / `write_file` / `exec_command` (30s timeout); zod schemas → JSON schema via `zod-to-json-schema`.
- **`prompt_template.ts`** — system/role prompts for every agent.
- **`logger.ts`** — JSONL logger to `logs/app.log.jsonl`; singleton `logger`.

## 数据流 (Data flow)

```
user input → Agent.run()
  → push user message, persist history
  → LLMClient.call(messages, toolDefinitions) → assistant message
       ├─ content only (no tool_calls) → final answer, stop
       └─ tool_calls → ToolExecutor.callTool() per call → role:'tool' appended → loop
  → ConversationStore.save() after each model call and each tool batch
```

The session JSONL *is* the OpenAI message array; the log JSONL holds `{ timestamp, level, message }` per LLM/tool event. Together they reconstruct a full run — this is what `diagnose-agent` cross-references.

## Skills (`.claude/`)

**Skills** (`.claude/skills/*.md`) are markdown docs the model follows phase-by-phase — the user-facing slash commands. Each skill is self-contained: the model executes the steps directly (Read / Grep / Bash / Edit), with no separate orchestration layer.

| Skill | Purpose |
|-------|---------|
| `new-agent` | Build a new agent type over 5 phases: requirements → architecture → code → tests → docs |
| `diagnose-agent` | Diagnose a runtime failure from pasted terminal output: read-through of code + session + log → root cause (file:line) → fix |

## Extending

**Add an agent type** — run `/new-agent` (see `.claude/skills/new-agent.md`).

**Add a custom tool** — (1) zod schema + `{ name, description, parameters }` in `util/tool_definition.ts`; (2) handler in `util/tools.ts` (parsed params → string); (3) `agent.toolExecutor.registerTool('name', handler, definition)` in `run.ts`.
