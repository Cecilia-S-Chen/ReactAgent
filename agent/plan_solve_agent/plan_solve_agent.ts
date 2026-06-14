import { planSolvePlannerPrompt, planSolveExecutorPrompt } from "../../util/prompt_template";
import { ConversationStore } from "../../util/conversation_store";
import { ToolExecutor } from "../../util/tool_executor";
import { LLMClient } from "../../util/llm_client";
import OpenAI from 'openai'

/** 计划中的单个步骤 */
export interface PlanStep {
    step: number
    description: string
    expected_output?: string
}

/** Planner 生成的执行计划 */
export interface Plan {
    plan: PlanStep[]
}

/**
 * Plan-and-Solve Agent
 *
 * 包含两个功能组件：
 * - Planner：根据用户输入拆解任务，生成结构化的执行计划
 * - Executor：按照计划逐步执行，每一步内部使用 ReAct 循环调用工具
 *
 * 会话信息通过 ConversationStore 持久化到 JSONL 文件，
 * 支持会话恢复（重新构建同名 sessionId 的实例即可继续执行）。
 */
export class PlanSolveAgent {
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

    /** 暴露 ToolExecutor 实例，供外部注册工具 */
    get toolExecutor(): ToolExecutor {
        return this._tool_executor
    }

    /**
     * Planner 组件：根据用户输入生成执行计划
     *
     * 直接调用 LLM（不使用工具），要求模型以 JSON 格式输出分步计划。
     * Planner 为一次性调用，不持久化。
     */
    async plan(user_input: string): Promise<Plan> {
        console.log(`\n📋 [Planner] 正在为任务生成执行计划...`)

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: planSolvePlannerPrompt() },
            { role: 'user', content: user_input }
        ]

        const response = await this._llm_client.call(messages, [])
        const content = response.content || ''

        try {
            // 尝试从 markdown 代码块或纯文本中提取 JSON
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
            const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim()
            const plan: Plan = JSON.parse(jsonStr)

            if (!plan.plan || !Array.isArray(plan.plan) || plan.plan.length === 0) {
                throw new Error('计划为空或格式不正确')
            }

            console.log(`📋 [Planner] 计划生成完毕，共 ${plan.plan.length} 个步骤：`)
            plan.plan.forEach(s => {
                console.log(`   ${s.step}. ${s.description}`)
                if (s.expected_output) {
                    console.log(`      预期产出: ${s.expected_output}`)
                }
            })

            return plan
        } catch (error) {
            const errMsg = `解析 Planner 返回的计划失败: ${error instanceof Error ? error.message : String(error)}`
            console.error(`❌ [Planner] ${errMsg}`)
            console.error(`   原始响应: ${content.slice(0, 500)}`)
            throw new Error(errMsg)
        }
    }

    /**
     * Executor 组件：按照计划逐步执行
     *
     * 每一步内部使用 ReAct 循环：模型可以调用工具，直到给出最终文本响应。
     * 执行上下文在步骤之间保持，后续步骤可以引用前面步骤的结果。
     * 对话历史通过 ConversationStore 持久化，支持断点续执。
     */
    async execute(user_input: string, plan: Plan): Promise<string> {
        console.log(`\n🔨 [Executor] 开始按计划执行，共 ${plan.plan.length} 个步骤`)

        // 尝试加载已有会话历史，否则以系统提示词初始化
        const saved = this._store.load(this._sessionId) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]
        const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = saved.length > 0
            ? saved
            : [{ role: 'system', content: planSolveExecutorPrompt(user_input, plan.plan) }]

        const stepResults: string[] = []

        for (const step of plan.plan) {
            const stepLabel = `步骤 ${step.step}/${plan.plan.length}`
            console.log(`\n🔨 [Executor] 执行 ${stepLabel}: ${step.description}`)

            // 为当前步骤构造执行指令
            let stepInstruction = `请执行${stepLabel}：${step.description}`
            if (step.expected_output) {
                stepInstruction += `\n预期产出：${step.expected_output}`
            }
            stepInstruction += `\n\n完成此步骤后，请总结执行结果。`

            history.push({ role: 'user', content: stepInstruction })
            this._persistHistory(history)

            // ReAct 循环：模型反复调用工具，直到给出最终文本响应
            while (true) {
                try {
                    const response = await this._llm_client.call(
                        history,
                        this._tool_executor.toolDefinitions
                    )
                    history.push(response)
                    this._persistHistory(history)

                    // 没有 tool_calls → 模型认为当前步骤已完成
                    if (!response.tool_calls || !response.tool_calls.length) {
                        const result = response.content || ''
                        const preview = result.length > 150 ? result.slice(0, 150) + '...' : result
                        console.log(`✅ [Executor] ${stepLabel} 完成: ${preview}`)
                        stepResults.push(`### ${stepLabel}\n${result}`)
                        break
                    }

                    // 有 tool_calls → 依次执行工具
                    for (const tool_call of response.tool_calls) {
                        if (tool_call.type === 'function') {
                            console.log(`   🔧 [Executor] 调用工具: ${tool_call.function.name}`)
                        }
                        await this._tool_executor.callTool(tool_call, history)
                    }
                    this._persistHistory(history)
                } catch (error) {
                    const errMsg = `步骤 ${step.step} 执行出错: ${error instanceof Error ? error.message : String(error)}`
                    console.error(`❌ [Executor] ${errMsg}`)
                    stepResults.push(`### ${stepLabel}（失败）\n${errMsg}`)
                    break
                }
            }
        }

        const finalResult = stepResults.join('\n\n')
        console.log(`\n🏁 [Executor] 全部步骤执行完毕`)

        return finalResult
    }

    /**
     * 主入口：Plan → Execute 两阶段流程
     *
     * 1. Planner 分析任务，生成分步计划
     * 2. Executor 按计划逐步执行（对话历史自动持久化）
     */
    async run(user_input: string): Promise<string> {
        console.log(`🤔 User input: ${user_input}`)

        // Phase 1: Plan — 拆解任务、制定计划
        const plan = await this.plan(user_input)

        // Phase 2: Execute — 按计划逐步执行
        const result = await this.execute(user_input, plan)

        console.log(`\n✅ Final result:\n${result}`)
        return result
    }

    /** 重置会话：删除持久化文件并生成新的会话 ID */
    reset() {
        this._store.delete(this._sessionId)
        this._sessionId = `session_${Date.now()}`
    }

    /** 将 Executor 对话历史持久化到 JSONL 文件 */
    private _persistHistory(history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
        this._store.save(this._sessionId, history)
    }
}
