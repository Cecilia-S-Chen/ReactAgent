---
name: new-agent
description: 根据 Agent 目标描述，按工作流依次推进：需求分析 → 架构设计 → 代码实现 → 测试验证 → 文档刷新
---

# New Agent 开发工作流

根据用户对新 Agent 的目标描述，按以下 5 个阶段依次推进。**每个阶段结束后等待用户确认再进入下一阶段。**

## 核心原则

- 所有与 LLM 的交互只通过 `LLMClient.call()`，不绕过它
- 工具结果必须通过 `ToolExecutor.callTool()` 追加到 `history`
- 消息格式遵循 OpenAI `ChatCompletionMessageParam[]` 类型
- 复用现有 util 模块（`LLMClient`、`ToolExecutor`、`ConversationStore`、`logger`），避免重复造轮子

---

## 阶段 1：需求分析 → 架构设计

### 输入
用户对新 Agent 目标的自然语言描述。

### 执行步骤

1. **解析需求**，识别关键能力维度：
   - 是否需要**多阶段流水线**（如 PlanSolveAgent 的 Plan → Execute）？
   - 是否需要**循环/迭代**（如多轮自我修正）？
   - 是否需要**新工具**？还是复用现有的 `read_file` / `write_file` / `exec_command`？
   - 是否需要**超出 ConversationStore 的状态管理**？
   - 与已有 Agent（ReactAgent / PlanSolveAgent）的**差异点**是什么？

2. **对照已有模式**，判断是扩展还是新建：
   - `ReactAgent`：单层 ReAct 循环，模型返回 tool_calls → 执行 → 回传 → 继续循环
   - `PlanSolveAgent`：两阶段 Plan → Execute，Execute 内每步一个 ReAct 循环

3. **产出架构设计**，包含：
   - 类的公开 API（`constructor(sessionId?)`、`run(user_input)`、`reset()`、`get toolExecutor()`）
   - 核心循环的伪代码或流程图
   - 所需新工具的清单（名称、参数、功能）
   - 与现有 Agent 的差异对比表
   - 文件变更清单（哪些文件需要新增/修改）

### 输出格式

用以下结构呈现设计。按伪代码形式呈现，注意不要修改任何文件。

```
## 架构设计：<Agent 名称>

### 核心模式
（单层循环 / 多阶段 / 其他）

### 伪代码
（核心 run() 方法的伪代码）

### 公开 API
- constructor(sessionId?: string)
- run(user_input: string): Promise<string>
- reset(): void
- get toolExecutor(): ToolExecutor

### 新工具清单
| 工具名 | 参数 | 功能 |
|--------|------|------|

### 与已有 Agent 对比
| 维度 | ReactAgent | PlanSolveAgent | NewAgent |
|------|------------|----------------|----------|

### 文件变更清单
- 新增: agent/<name>/<name>.ts
- 修改: util/prompt_template.ts
- ...
```

**⏸️ 等待用户确认架构后再进入阶段 2。**

---

## 阶段 2：代码实现

按以下顺序实现，每步完成后说明做了什么：

### 2.1 系统提示词

在 `util/prompt_template.ts` 中添加新 Agent 的系统提示词函数：

```ts
export function <name>SystemPrompt(): string {
    return `你是一个...`
}
```

如果 Agent 包含多个角色（如 Planner + Executor），分别定义。

### 2.2 新工具（如需）

**Step A** — 在 `util/tool_definition.ts` 中定义 Zod Schema：

```ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const XxxSchema = z.object({
    param1: z.string().describe("参数说明"),
})

export const xxx_definition = {
    name: 'xxx',
    description: '工具功能描述',
    parameters: zodToJsonSchema(XxxSchema),
}
```

**Step B** — 在 `util/tools.ts` 中实现处理函数：

```ts
import { XxxSchema } from './tool_definition'

type XxxParams = z.infer<typeof XxxSchema>

export async function xxx(params: XxxParams): Promise<string> {
    const { param1 } = XxxSchema.parse(params)
    // ... 实现逻辑
    return "执行结果"
}
```

### 2.3 Agent 核心类

在 `agent/<name>/<name>.ts` 中实现，遵循已有模式：

```ts
import { ConversationStore } from "../../util/conversation_store";
import { ToolExecutor } from "../../util/tool_executor";
import { LLMClient } from "../../util/llm_client";
import { <name>SystemPrompt } from "../../util/prompt_template";
import OpenAI from 'openai'

export class <Name>Agent {
    private _tool_executor: ToolExecutor
    private _llm_client: LLMClient
    private _store: ConversationStore
    private _sessionId: string

    constructor(sessionId?: string) {
        this._tool_executor = new ToolExecutor()
        this._llm_client = new LLMClient()
        this._store = new ConversationStore()
        this._sessionId = sessionId || `session_${Date.now()}`
    }

    get toolExecutor(): ToolExecutor {
        return this._tool_executor
    }

    async run(user_input: string): Promise<string> {
        // 核心逻辑
    }

    reset() {
        this._store.delete(this._sessionId)
        this._sessionId = `session_${Date.now()}`
    }
}
```

关键实现要点：
- 构造时通过 `ConversationStore.load()` 尝试恢复已有会话
- 调用 LLM 时传入 `this._tool_executor.toolDefinitions`
- 每次模型调用和工具执行后调用 `_store.save()` 持久化
- 错误处理：工具执行失败时错误信息回传 history，不中断 Agent

### 2.4 入口注册

在 `run.ts`（或新建入口文件）中实例化并注册工具：

```ts
import { <Name>Agent } from "./agent/<name>/<name>"
const agent = new <Name>Agent()
agent.toolExecutor.registerTool('xxx', xxx, xxx_definition)
await agent.run("用户任务")
```

---

## 阶段 3：测试构造

### 方案选择

当前项目无测试框架。根据场景选择：

**方案 A — vitest 单元测试**（推荐，适合长期维护）：
```bash
bun add -d vitest
```
在 `agent/<name>/__tests__/<name>.test.ts` 中编写。

**方案 B — 集成验证脚本**（快速验证）：
直接在 `run.ts` 或独立脚本中跑真实任务，检查产出。

### 必测场景

| # | 场景 | 验证点 |
|---|------|--------|
| 1 | 纯文本任务 | Agent 完成无工具调用的任务，返回正确文本 |
| 2 | 单工具调用 | 模型返回 1 个 tool_call，正确执行并回传结果 |
| 3 | 多工具调用 | 多个 tool_calls 全部执行完毕后继续循环 |
| 4 | 工具执行失败 | 工具异常不崩溃，错误信息回传 history |
| 5 | 会话恢复 | 相同 sessionId 重建 Agent，加载已有历史 |
| 6 | reset 行为 | reset() 后旧 session 删除，新 sessionId 生成 |

### Mock 策略

对于单元测试，Mock `LLMClient.call()` 来模拟不同的模型返回：
- 返回纯文本 `{ content: "answer" }`
- 返回 tool_calls `{ tool_calls: [{...}] }`
- 返回空响应
- 抛出异常

**⏸️ 测试用例编写完成后展示给用户确认。**

---

## 阶段 4：测试验证

运行阶段 3 编写的测试用例，确保全部通过：

```bash
bun run vitest run        # 方案 A
bun run run.ts            # 方案 B
```

如果测试未通过，回到阶段 2 修复后重跑，直到全部通过。

---

## 阶段 5：文档刷新

创建 `agent/<name>/<name>.md`，包含：

```markdown
# <Agent 名称>

## 架构
（ASCII 流程图或架构图）

## 核心特性
（与已有 Agent 的差异点）

## API 参考
- constructor(sessionId?: string)
- run(user_input: string): Promise<string>
- reset(): void
- get toolExecutor(): ToolExecutor

## 使用示例
（从 run.ts 中截取完整示例）

## 与其他 Agent 对比
| 维度 | ReactAgent | PlanSolveAgent | This |
|------|------------|----------------|------|
```

---

## 工作流完成

全部 5 个阶段完成后，汇总报告：
- 新增/修改了哪些文件
- 测试覆盖了哪些场景
- Agent 的核心能力
