import { logger } from "./logger";
import OpenAI from 'openai'

type ToolDefinition = {
    name: string
    description: string
    parameters: any
}

export class ToolExecutor {
    private _tool_handler_list: Map<string, any>
    private _tool_definition_list: OpenAI.Chat.Completions.ChatCompletionTool[]

    constructor() {
        this._tool_handler_list = new Map()
        this._tool_definition_list = []
    }

    /** 注册工具：绑定工具名、处理函数与工具定义 */
    registerTool(toolName: string, toolFunc: any, toolDefinition: ToolDefinition): void {
        this._tool_handler_list.set(toolName, toolFunc)
        this._tool_definition_list.push({
            type: 'function',
            function: toolDefinition
        })
    }

    /** 获取当前已注册的工具定义列表（供模型调用时传入） */
    get toolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
        return this._tool_definition_list
    }

    /** 根据工具名获取处理函数 */
    getToolHandler(toolName: string): any | undefined {
        return this._tool_handler_list.get(toolName)
    }

    /** 执行单个 tool_call，将结果追加到 history_message */
    async callTool(
        tool_call: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
        history_message: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ): Promise<void> {
        if (tool_call.type !== 'function') {
            return
        }

        const function_name = tool_call.function.name
        const function_args = JSON.parse(tool_call.function.arguments)
        const function_handler = this._tool_handler_list.get(function_name)

        if (!function_handler) {
            console.error(`❌Tool not found: ${function_name}`)
            throw new Error(`Tool not found: ${function_name}`)
        }

        try {
            const tool_result = await function_handler(function_args)
            await logger.info(`{role: 'tool', tool_call_id: ${tool_call.id}, content: ${typeof tool_result === 'string' ? tool_result : JSON.stringify(tool_result)}}`)
            history_message.push({
                role: 'tool',
                tool_call_id: tool_call.id,
                content: typeof tool_result === 'string' ? tool_result : JSON.stringify(tool_result)
            })
        } catch (error) {
            console.error(`❌Tool execution error: ${error}`)
            await logger.error(`{role: 'tool', tool_call_id: ${tool_call.id}, content: ${String(error)}}`)
            history_message.push({
                role: 'tool',
                tool_call_id: tool_call.id,
                content: JSON.stringify({ error: String(error) })
            })
        }
    }
}
