# Plan-and-Solve Agent

## 概述

Plan-and-Solve Agent 是一种两阶段任务执行架构。它先将用户的复杂任务交给 **Planner** 拆解为步骤化的执行计划，再由 **Executor** 按计划逐步执行。每一步内部使用 ReAct 循环调用工具。

## 架构

```
用户输入
  │
  ▼
┌─────────────────────────────────┐
│   PlanSolveAgent.run()          │
│                                 │
│  Phase 1: Planner               │
│  ┌───────────────────────────┐  │
│  │ LLM 直接调用（无工具）       │  │
│  │ 输出 JSON 格式执行计划       │  │
│  │ {                          │  │
│  │   "plan": [                │  │
│  │     {"step": 1, ...},      │  │
│  │     {"step": 2, ...}       │  │
│  │   ]                        │  │
│  │ }                          │  │
│  └────────────┬──────────────┘  │
│               │                 │
│               ▼                 │
│  Phase 2: Executor              │
│  ┌───────────────────────────┐  │
│  │ for each step in plan:    │  │
│  │   ┌─────────────────────┐ │  │
│  │   │ ReAct 循环 (LLM+工具) │ │  │
│  │   │ 直到模型给出文本回答   │ │  │
│  │   └─────────────────────┘ │  │
│  │   收集步骤结果              │  │
│  │   (上下文在步骤间保持)      │  │
│  └────────────┬──────────────┘  │
│               │                 │
│               ▼                 │
│         汇总最终结果              │
└─────────────────────────────────┘
```

## 核心组件

### Planner（规划器）

- **职责**：接收用户任务，拆解出结构化的执行计划
- **调用方式**：直接调用 LLM，不提供工具
- **输出格式**：JSON

```json
{
  "plan": [
    {
      "step": 1,
      "description": "分析需求，确定文件结构",
      "expected_output": "项目文件清单和目录结构"
    },
    {
      "step": 2,
      "description": "实现核心逻辑代码",
      "expected_output": "可运行的核心模块"
    },
    {
      "step": 3,
      "description": "编写测试并验证功能",
      "expected_output": "测试通过报告"
    }
  ]
}
```

### Executor（执行器）

- **职责**：按计划逐步执行，每一步内部使用 ReAct 循环
- **特点**：
  - 执行上下文在步骤之间保持，后续步骤可参考前面的结果
  - 每步独立执行，单步失败不影响后续步骤
  - 每步结束时模型需总结执行结果

## 与 React Agent 的对比

| 维度 | React Agent | Plan-and-Solve Agent |
|---|---|---|
| 执行模式 | 单阶段 ReAct 循环 | Plan → Execute 两阶段 |
| 任务拆解 | LLM 隐式拆解 | Planner 显式输出结构化计划 |
| 执行可控性 | 较低，模型自行决策何时结束 | 较高，按预设计划逐步推进 |
| 适用场景 | 简单到中等复杂度的任务 | 复杂、多步骤、需要清晰分工的任务 |
| 错误恢复 | 依赖 LLM 自行修正 | 每步独立，单步失败可跳过或重试 |

## 使用示例

```typescript
import { PlanSolveAgent } from "./agent/plan_solve_agent/plan_solve_agent"
import { write_file, read_file, exec_command } from "./util/tools"
import {
  write_file_definition,
  read_file_definition,
  exec_command_definition,
} from "./util/tool_definition"

const agent = new PlanSolveAgent()

// 注册工具
agent.toolExecutor.registerTool("read_file", read_file, read_file_definition)
agent.toolExecutor.registerTool("write_file", write_file, write_file_definition)
agent.toolExecutor.registerTool("exec_command", exec_command, exec_command_definition)

// 执行任务（自动走 Plan → Execute 流程）
await agent.run("创建一个贪吃蛇游戏程序，放到 workspace 路径下")

// 也可以分步调用
const plan = await agent.plan("分析项目结构并给出优化建议")
const result = await agent.execute("分析项目结构并给出优化建议", plan)
```

## API

### `PlanSolveAgent`

| 方法 | 说明 |
|---|---|
| `constructor()` | 创建 agent 实例 |
| `plan(user_input: string): Promise<Plan>` | Planner 组件：根据任务生成执行计划 |
| `execute(user_input: string, plan: Plan): Promise<string>` | Executor 组件：按计划逐步执行 |
| `run(user_input: string): Promise<string>` | 主入口：自动走 Plan → Execute 两阶段流程 |
| `get toolExecutor(): ToolExecutor` | 获取 ToolExecutor 实例，用于注册工具 |

### 类型定义

```typescript
interface PlanStep {
  step: number
  description: string
  expected_output?: string
}

interface Plan {
  plan: PlanStep[]
}
```

## 依赖的 util 模块

| 模块 | 用途 |
|---|---|
| `LLMClient` | 调用大语言模型 API |
| `ToolExecutor` | 注册与执行工具 |
| `logger` | JSON 格式日志记录 |
| `prompt_template` | Planner 与 Executor 系统提示词模板 |
