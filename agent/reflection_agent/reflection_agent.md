# ReflectionAgent

通过「生成 → 反思 → 修订」的迭代循环不断自我精炼，直到答案通过自我审查或达到最大迭代次数。

## 架构

```
User input
  │
  ▼
┌─────────────────────────────────────┐
│  Phase 1: Generate（ReAct 循环）     │
│  think → act → observe → ... → 答案  │
└─────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────┐
│  Phase 2: Reflect（纯 LLM，无工具）  │
│  自我批评：issues / suggestions /    │
│  score / pass                        │
└─────────────────────────────────────┘
  │
  ├── pass == true ───────────────────►  返回答案（收敛）
  │
  ▼  pass == false 且未达最大轮次
┌─────────────────────────────────────┐
│  Phase 3: Revise（ReAct 循环）       │
│  基于反思的 issues/suggestions 改进   │
└─────────────────────────────────────┘
  │
  └──► 回到 Phase 2，循环往复
```

### 关键设计

- **反馈链路闭合**：每轮 Reflect 的 `issues` / `suggestions` / `score` 会被格式化成 Revise 指令推入历史，驱动模型针对性修正——这是 ReflectionAgent 的核心价值。
- **反思是独立的一次性推理**：使用临时 messages 数组（system 角色），不污染主对话历史，与 `PlanSolveAgent.plan()` 的设计一致。
- **双重边界保护**：外层 `maxIterations`（默认 3）限制 Generate→Reflect→Revise 轮次；内层 `MAX_REACT_ITERATIONS`（15）防止单轮 ReAct 反复调用工具不收敛。
- **全链路容错**：工具失败回传 history（由 ToolExecutor 处理）、反思 JSON 解析失败降级、反思 LLM API 失败降级，任一环节异常都不会中断整个 Agent。

## 核心特性

| 特性 | 说明 |
|------|------|
| 自我改进 | 显式反思 + 迭代修订，区别于 ReactAgent 的"答完即止" |
| 结构化反思 | 反思输出 JSON（pass / score / issues / suggestions / summary） |
| 收敛控制 | 反思通过 OR 达到最大轮次，二者先到即止 |
| 会话持久化 | 对话历史通过 ConversationStore 存 JSONL，支持断点续执 |

## API 参考

```ts
class ReflectionAgent {
    constructor(sessionId?: string, maxIterations?: number)
    run(user_input: string): Promise<string>
    reset(): void
    get toolExecutor(): ToolExecutor
}

interface ReflectionResult {
    pass: boolean        // 是否通过审查
    score: number        // 1-10 评分
    issues: string[]     // 发现的问题
    suggestions: string[]// 改进建议
    summary: string      // 一句话总结
}
```

## 使用示例

```ts
import { ReflectionAgent } from "./agent/reflection_agent/reflection_agent"
import { write_file, read_file, exec_command } from "./util/tools"
import { write_file_definition, read_file_definition, exec_command_definition } from "./util/tool_definition"

const agent = new ReflectionAgent(undefined, 3)  // 自动 sessionId，最多 3 轮
agent.toolExecutor.registerTool('write_file', write_file, write_file_definition)
agent.toolExecutor.registerTool('read_file', read_file, read_file_definition)
agent.toolExecutor.registerTool('exec_command', exec_command, exec_command_definition)

await agent.run("在 workspace 路径下创建贪吃蛇小游戏，实现后直接运行启动游戏")
```

## 运行与测试

```bash
bun install          # 安装依赖
bun run start        # 运行 Agent（入口 run.ts）
bun run test         # 运行 vitest 单元测试
bun run test:watch   # 测试监听模式
```

测试覆盖 10 个场景（`agent/reflection_agent/__tests__/reflection_agent.test.ts`）：纯文本任务、单/多工具调用、工具失败容错、会话恢复、reset、反思不通过→修订、达最大迭代、JSON 解析失败降级、**反馈链路闭合验证**。通过 mock `LLMClient.call()` 模拟各种模型返回，无真实 API 依赖。

## 与其他 Agent 对比

| 维度 | ReactAgent | PlanSolveAgent | ReflectionAgent |
|------|------------|----------------|-----------------|
| 循环模式 | 单层 ReAct | Plan → Execute(ReAct/step) | Generate → Reflect → Revise 循环 |
| 自我改进 | ❌ | ❌ | ✅ 显式反思 + 迭代修订 |
| 收敛条件 | 模型停止调工具 | 计划步骤执行完 | 反思通过 OR 达最大轮次 |
| LLM 调用模式 | 全程带工具 | Planner 无工具，Executor 带工具 | ReAct 带工具 + Reflect 无工具 |
| 新工具需求 | — | — | 无（复用现有工具） |
| 适用场景 | 直接问答/操作 | 复杂多步任务 | 对答案质量有要求、需精炼的场景 |

## 已知限制

- 反思阶段使用临时 messages 数组，反思过程不持久化到 session 文件（与 PlanSolveAgent.plan() 一致）。若在 Reflect 之后、Revise 之前崩溃并恢复，模型将缺少上一轮反思上下文（但主对话历史完整保留）。
- 反思质量依赖底层 LLM 的自我批判能力；若 LLM 反思偏宽松（总是 pass），迭代提前收敛，改进幅度有限。
- 共享基础设施（`ToolExecutor` 的日志格式、`ConversationStore.load` 对损坏 JSONL 的容错）存在既有问题，非本 Agent 引入，超出本次范围。
