import { reactAgentSystemPrompt } from "../../util/prompt_template";
import { logger } from "../../util/logger";
import { ConversationStore } from "../../util/conversation_store";
import { ToolExecutor } from "../../util/tool_executor";
import { LLMClient } from "../../util/llm_client";
import OpenAI from 'openai'

export class ReactAgent {
    private _tool_executor: ToolExecutor
    private _llm_client: LLMClient
    private _history_message: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    private _store: ConversationStore
    private _sessionId: string

    constructor(sessionId?: string) {
        this._tool_executor = new ToolExecutor()
        this._llm_client = new LLMClient()
        this._store = new ConversationStore()
        this._sessionId = sessionId || `session_${Date.now()}`

        const saved = this._store.load(this._sessionId) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]
        this._history_message = saved.length > 0
            ? saved
            : [{ role: 'system', content: reactAgentSystemPrompt() }]
    }

    /** 暴露 ToolExecutor 实例，供外部直接注册/调用工具 */
    get toolExecutor(): ToolExecutor {
        return this._tool_executor
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
                    if (tool_call.type === 'function') {
                        console.log(`🔧Call tool: ${tool_call.function.name}`)
                    }
                    await this._tool_executor.callTool(tool_call, this._history_message)
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
            { role: 'system', content: reactAgentSystemPrompt() }
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
        const content = await this._llm_client.call(
            history_message,
            this._tool_executor.toolDefinitions
        )
        await logger.info(JSON.stringify(content))
        history_message.push(content)
        return content
    }
}