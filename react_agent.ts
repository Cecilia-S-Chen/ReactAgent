import { initializeSystemPrompt } from "./prompt_template";
import { logger } from "./logger";
import { ConversationStore } from "./conversation_store";
import OpenAI from 'openai'

type ToolDefinition = {
    name: string
    description: string
    parameters: any
}

export class ReactAgent {
    private _tool_handler_list: Map<string, any>
    private _tool_definition_list: OpenAI.Chat.Completions.ChatCompletionTool[]
    private _model_client: OpenAI
    private _history_message: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    private _store: ConversationStore
    private _sessionId: string

    constructor(sessionId?: string) {
        this._tool_handler_list = new Map()
        this._tool_definition_list = []
        this._model_client = new OpenAI({
            baseURL: "https://api.z.ai/api/paas/v4",
            apiKey: process.env.LLM_APIKEY,
        })
        this._store = new ConversationStore()
        this._sessionId = sessionId || `session_${Date.now()}`

        const saved = this._store.load(this._sessionId) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]
        this._history_message = saved.length > 0
            ? saved
            : [{ role: 'system', content: initializeSystemPrompt() }]
    }

    registerTool(toolName: string, tool_func: any, tool_definition: ToolDefinition) {
        this._tool_handler_list.set(toolName, tool_func)
        this._tool_definition_list.push({
            type: 'function',
            function: tool_definition
        })
    }

    async run(user_input: string) {
        console.log(`🤔User input: ${user_input}`)
        await logger.info(JSON.stringify({role: 'user', content: user_input}))
        this._history_message.push({ role: 'user', content: user_input })

        while (true) {
            try {
                const response = await this._call_model(this._history_message)
                this._persistHistory()

                if (!response.tool_calls || !response.tool_calls.length) {
                    console.log(`✅ Final answer： ${response.content}`)
                    return response.content || ''
                }

                for (const tool_call of response.tool_calls) {
                    await this._call_tool(tool_call, this._history_message)
                }
                this._persistHistory()
            } catch (error) {
                console.error(`❌Agent run error: ${error}`)
                return
            }
        }
    }

    reset() {
        this._history_message = [
            { role: 'system', content: initializeSystemPrompt() }
        ]
        this._store.delete(this._sessionId)
        this._sessionId = `session_${Date.now()}`
    }

    private _persistHistory() {
        this._store.save(this._sessionId, this._history_message)
    }

    private async _call_model(
        history_message: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ) {
        const response = await this._model_client.chat.completions.create({
            model: process.env.MODEL_ID || 'qwen3-coder-plus',
            messages: history_message,
            tools: this._tool_definition_list,
            tool_choice: 'auto',
        })
        const content = response.choices[0]?.message
        await logger.info(JSON.stringify(response.choices[0]))
        history_message.push(content)
        return content
    }

    private async _call_tool(
        tool_call: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
        history_message: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ) {
        if (tool_call.type === 'function') {
            const function_name = tool_call.function.name
            const function_args = JSON.parse(tool_call.function.arguments)
            const function_handler = this._tool_handler_list.get(function_name)

            if (function_handler) {
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
                        content: JSON.stringify({error: String(error)})
                    })
                }
            } else {
                console.error(`❌Tool not found: ${function_name}`)
                throw new Error(`Tool not found: ${function_name}`)
            }
        }
    }
}