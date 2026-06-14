import OpenAI from 'openai'

export class LLMClient {
    private _client: OpenAI

    constructor() {
        this._client = new OpenAI({
            baseURL: "https://api.z.ai/api/paas/v4",
            apiKey: process.env.LLM_APIKEY,
        })
    }

    /** 调用大模型，返回 assistant message */
    async call(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: OpenAI.Chat.Completions.ChatCompletionTool[]
    ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
        const response = await this._client.chat.completions.create({
            model: process.env.MODEL_ID || 'qwen3-coder-plus',
            messages,
            tools,
            tool_choice: 'auto',
        })
        return response.choices[0]?.message
    }
}
