# React Agent

## 概述

React Agent 是基于 ReAct（Reasoning + Acting）模式的智能代理。它在单次对话中反复进行"推理→调用工具→获取反馈→继续推理"的循环，直到完成任务并给出最终答案。

## 架构

```
用户输入
  │
  ▼
┌────────────────────────┐
│     ReactAgent.run()    │
│                         │
│  while (true):          │
│    ┌─────────────────┐  │
│    │ LLM 推理         │  │  ← 携带对话历史 + 工具定义
│    │ (call_model)     │  │
│    └────────┬────────┘  │
│             │            │
│     有 tool_calls?       │
│     ├── 否 → 返回最终答案 │
│     └── 是               │
│          │               │
│    ┌─────▼──────────┐    │
│    │ 依次执行工具     │    │  ← ToolExecutor.callTool
│    │ 结果追加到历史   │    │
│    └─────┬──────────┘    │
│          │               │
│    持久化到会话文件       │  ← ConversationStore.save
│          │               │
│    继续下一轮循环         │
└────────────────────────┘
```

## 核心特性

- **ReAct 循环**：模型不断在推理和行动之间切换，直到产生最终结论
- **会话持久化**：通过 `ConversationStore` 将对话历史保存为 JSONL 文件，支持会话恢复
- **可注册工具**：通过 `ToolExecutor` 自由注册工具函数与定义，模型可按需调用
- **日志记录**：每次模型调用和工具执行都会通过 `logger` 记录

## 使用示例

```typescript
import { ReactAgent } from "./agent/react_agent/react_agent"
import { write_file, read_file, exec_command } from "./util/tools"
import {
  write_file_definition,
  read_file_definition,
  exec_command_definition,
} from "./util/tool_definition"

const agent = new ReactAgent()

// 注册工具
agent.toolExecutor.registerTool("read_file", read_file, read_file_definition)
agent.toolExecutor.registerTool("write_file", write_file, write_file_definition)
agent.toolExecutor.registerTool("exec_command", exec_command, exec_command_definition)

// 执行任务
await agent.run("创建一个贪吃蛇游戏程序，放到 workspace 路径下")

// 重置会话（开始新对话）
agent.reset()
```

## API

### `ReactAgent`

| 方法 | 说明 |
|---|---|
| `constructor(sessionId?: string)` | 创建 agent 实例。若不传 sessionId，自动以时间戳生成 |
| `run(user_input: string): Promise<string>` | 执行用户输入，返回模型的最终文本回答 |
| `reset(): void` | 清空对话历史，重置会话 ID |
| `get toolExecutor(): ToolExecutor` | 获取 ToolExecutor 实例，用于注册/查看工具 |

## 依赖的 util 模块

| 模块 | 用途 |
|---|---|
| `LLMClient` | 调用大语言模型 API |
| `ToolExecutor` | 注册与执行工具 |
| `ConversationStore` | 会话历史持久化（JSONL 文件） |
| `logger` | JSON 格式日志记录 |
| `prompt_template` | 系统提示词模板 |
