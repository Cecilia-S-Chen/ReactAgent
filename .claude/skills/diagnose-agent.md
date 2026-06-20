---
name: diagnose-agent
description: 定位 Agent run 运行时问题：通读代码 + session + 日志三路证据，定位根因(file:line) + 修复建议
---

# Agent 运行时问题诊断

当 `bun run run.ts` 运行 Agent 出错（终端打印报错 / stack / 异常退出）时，按本流程定位根因：
单轮通读**代码 + session + 日志**三处证据并交叉比对，必要时实际重跑复现。

## 输入

| 参数 | 必填 | 说明 |
|------|------|------|
| `terminalOutput` | ✅ | run 出错时的终端输出（症状）。直接粘贴整段控制台日志 |
| `agentName` | ❌ | `ReactAgent` / `PlanSolveAgent` / `ReflectionAgent`，加速定位；不填则从日志推断 |
| `sessionId` | ❌ | 指定 session；不填则取最近一个 |

## 诊断步骤

### 1. 分诊定位

从终端输出的 console 标记（如 `[ReflectionAgent]`、`[ReactAgent]`）或报错文案推断 agent 与其源码路径，并定位 session 文件：

- 有 `sessionId` → `workspace/sessions/<sessionId>.jsonl`
- 无 → `ls -t workspace/sessions/*.jsonl` 取最近一个

提取**错误签名**（报错中最具区分度的关键串，如 `400 The messages parameter is illegal`、`Tool not found`、`exec command fail`），供后续 grep。

### 2. 单轮通读三路证据

用 Read / Grep / Bash 实际查看，**交叉比对**以下三处，找出代码↔session↔日志互相印证的失败点：

1. **代码路径** — 读 agent 源码及其依赖的 util 模块（`llm_client.ts`、`tool_executor.ts`、`tools.ts`、`conversation_store.ts`、`prompt_template.ts`），从错误签名追踪执行路径，定位最可能产生症状的代码位置（给真实行号）。
2. **session 重放** — 读 `workspace/sessions/<id>.jsonl`，逐行还原消息序列，定位**失败断点**（最后一条 assistant 消息、畸形消息、缺失的 tool_call 配对、空 content 且无 tool_calls 等），还原失败那一刻的入参。
3. **日志关联** — `grep` `logs/app.log.jsonl` 中含错误签名的 `level: error` 行，与 session 执行步骤对齐。

对照项目惯例（消息须符合 OpenAI `ChatCompletionMessageParam`、工具结果须经 `ToolExecutor.callTool` 回传、history 须 `save` 持久化），找出偏离之处。

### 3. 必要时实际重跑

若证据不足以确认，直接重跑复现：

- 首选 `cd <项目根> && timeout 180 bun run run.ts 2>&1 | tee /tmp/diag_rerun.log`，grep 错误签名判定是否命中。
- run.ts 硬编码任务无法复现时，用 `bun -e '<内联 TS>'` 直接打中分诊定位的代码路径，构造最小复现。

> 重跑会新建 session 文件、可能写产物文件、消耗 LLM API —— 这是诊断副作用，可接受；复现脚本写在 `/tmp`，不改动 `agent/`、`util/`、`run.ts` 源码。

### 4. 输出

向用户汇报：

- **症状**：终端输出的核心报错
- **根因 + 代码位置**：`file:line`，附代码↔session↔日志如何互相印证的闭环
- **复现步骤**：基于实际重跑（若执行了）
- **修复建议**：指向具体 `file:line` 的修改（不要泛泛而谈）

修复需另起任务，不在本流程内。

## 示例

终端输出 `❌ [ReflectionAgent] 反思阶段 LLM 调用失败: 400 The messages parameter is illegal.` → 通读 `reflection_agent.ts` 的 `_reflect()` 与对应 session，定位到反思阶段只发了一条 system 消息被 GLM 拒收。
