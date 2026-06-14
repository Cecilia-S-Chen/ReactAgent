# React Agent

基于 ReAct (Reasoning + Acting) 模式的智能助手，通过"思考 → 行动 → 观察"循环自主完成复杂任务。

## 核心架构

```
用户输入 → ReactAgent.run()
              ├── LLMClient      # 调用大模型，返回回复/工具调用
              ├── ToolExecutor   # 注册 & 执行工具，结果回传模型
              ├── ConversationStore  # 会话持久化（JSONL）
              └── logger         # 结构化日志（JSONL）
```

### ReactAgent

ReAct 循环核心：接收用户输入后反复调用模型，如果模型返回工具调用则执行并将结果回传，直到模型输出最终答案。

### LLMClient

封装 OpenAI 兼容的模型调用，支持传入消息列表和工具定义，返回 assistant message。

### ToolExecutor

管理工具的全生命周期：注册（绑定名称、处理函数、参数 schema）、查询、调用。模型返回的 `tool_calls` 由它解析执行，结果自动追加到对话历史。

## 目录结构

```
Agent/
├── react_agent.ts          # ReactAgent 核心类
├── run.ts                  # 入口 + 工具注册示例
└── util/
    ├── llm_client.ts       # 大模型调用客户端
    ├── tool_executor.ts    # 工具注册 / 调用
    ├── tools.ts            # 工具实现（读文件 / 写文件 / 执行命令）
    ├── tool_definition.ts  # 工具参数 Schema（Zod）
    ├── prompt_template.ts  # 系统提示词
    ├── conversation_store.ts  # 会话持久化
    └── logger.ts           # JSONL 日志
```

## 内置工具

| 工具 | 功能 |
|---|---|
| `read_file` | 读取指定路径文件内容 |
| `write_file` | 在指定路径写入文件 |
| `exec_command` | 执行 Shell 命令（30s 超时） |

工具参数使用 Zod Schema 校验，自动生成 JSON Schema 传给模型。

## 快速开始

### 1. 环境准备

```bash
bun install
```

### 2. 配置环境变量

在项目根目录创建 `.env` 文件：

```env
LLM_APIKEY=<你的 API Key>
MODEL_ID=glm-4.7
```

`MODEL_ID` 可选，默认使用 `qwen3-coder-plus`。任何 OpenAI 兼容 API 均可使用——修改 `util/llm_client.ts` 中的 `baseURL` 即可切换。

### 3. 运行

```bash
bun run run.ts
```

默认任务为"整理 `workspace/snake_game.py` 的设计文档"。修改 `run.ts` 中的 `react_agent.run(...)` 参数即可执行自定义任务。

## 自定义工具

1. 在 `util/tool_definition.ts` 中用 Zod 定义参数 Schema，导出 `xxx_definition`
2. 在 `util/tools.ts` 中实现工具函数
3. 在 `run.ts` 中通过 `agent.toolExecutor.registerTool()` 注册

```ts
// 注册示例
react_agent.toolExecutor.registerTool('tool_name', handlerFunc, toolDefinition)
```

## 数据存储

- **会话记录**：`workspace/sessions/<sessionId>.jsonl`，一行一条消息
- **运行日志**：`logs/app.log.jsonl`，按时间戳记录每次模型调用和工具执行
