import { reflectionAgentSystemPrompt, reflectionAgentReflectSystemPrompt } from "../../util/prompt_template";
import { logger } from "../../util/logger";
import { ConversationStore } from "../../util/conversation_store";
import { ToolExecutor } from "../../util/tool_executor";
import { LLMClient } from "../../util/llm_client";
import OpenAI from 'openai'

/** 反思结果 */
export interface ReflectionResult {
    pass: boolean
    score: number
    issues: string[]
    suggestions: string[]
    summary: string
}

/** 内层 ReAct 循环的最大迭代次数（防止模型反复调用工具不收敛导致死循环） */
const MAX_REACT_ITERATIONS = 15

/**
 * Reflection Agent
 *
 * 三阶段迭代循环：Generate（ReAct）→ Reflect（纯 LLM 自审）→ Revise（ReAct 修订）
 * 通过自我批评和迭代精炼来提升输出质量，直到反思通过或达到最大迭代次数。
 *
 * 会话信息通过 ConversationStore 持久化到 JSONL 文件，
 * 支持会话恢复（重新构建同名 sessionId 的实例即可继续执行）。
 */
export class ReflectionAgent {
    private _tool_executor: ToolExecutor
    private _llm_client: LLMClient
    private _history_message: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    private _store: ConversationStore
    private _sessionId: string
    private _max_iterations: number

    constructor(sessionId?: string, maxIterations = 3) {
        this._tool_executor = new ToolExecutor()
        this._llm_client = new LLMClient()
        this._store = new ConversationStore()
        this._sessionId = sessionId || `session_${Date.now()}`
        this._max_iterations = maxIterations

        const saved = this._store.load(this._sessionId) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]
        this._history_message = saved.length > 0
            ? saved
            : [{ role: 'system', content: reflectionAgentSystemPrompt() }]
    }

    /** 暴露 ToolExecutor 实例，供外部注册工具 */
    get toolExecutor(): ToolExecutor {
        return this._tool_executor
    }

    /**
     * 主入口：Generate → (Reflect → Revise)* 循环
     *
     * 1. Generate：ReAct 循环生成初步答案
     * 2. Reflect：纯 LLM 调用自我批判当前答案
     * 3. Revise：基于反思意见改进答案（ReAct 循环）
     * 循环直到反思通过或达到最大迭代次数
     */
    async run(user_input: string): Promise<string> {
        console.log(`🤔 [ReflectionAgent] User input: ${user_input}`)
        await logger.info(JSON.stringify({ role: 'user', content: user_input }))

        // 立即将用户输入入历史并持久化，确保在后续异常时仍可从持久化历史恢复（与 ReactAgent 一致）
        this._history_message.push({ role: 'user', content: user_input })
        this._persistHistory()

        let currentAnswer = ''
        let lastReflection: ReflectionResult | null = null

        for (let iteration = 1; iteration <= this._max_iterations; iteration++) {
            const isFirstRound = iteration === 1
            const phaseLabel = isFirstRound ? 'Generate' : 'Revise'
            console.log(`\n🔄 [ReflectionAgent] 第 ${iteration}/${this._max_iterations} 轮 (${phaseLabel} 阶段)`)

            // Revise 阶段：基于上一轮反思结果构造修订指令（这是反馈链路的关键，必须传入真实反思数据）
            if (!isFirstRound && lastReflection) {
                const reviseInstruction = this._formatReflectionForRevise(lastReflection)
                this._history_message.push({ role: 'user', content: reviseInstruction })
                this._persistHistory()
            }

            // 每轮重新收集本轮答案，避免上一轮的 stale answer 被误当作本轮产出
            currentAnswer = ''

            // --- Phase 1 or 3: Generate / Revise via ReAct loop（带最大迭代保护）---
            let reactError: string | null = null
            for (let reactIter = 0; reactIter < MAX_REACT_ITERATIONS; reactIter++) {
                try {
                    const response = await this._call_model(this._history_message)
                    this._persistHistory()

                    if (!response.tool_calls || !response.tool_calls.length) {
                        currentAnswer = response.content || ''
                        const preview = currentAnswer.length > 200
                            ? currentAnswer.slice(0, 200) + '...'
                            : currentAnswer
                        console.log(`✅ [ReflectionAgent] ${phaseLabel} 完成: ${preview}`)
                        break
                    }

                    for (const tool_call of response.tool_calls) {
                        if (tool_call.type === 'function') {
                            console.log(`   🔧 [ReflectionAgent] 调用工具: ${tool_call.function.name}`)
                        }
                        await this._tool_executor.callTool(tool_call, this._history_message)
                    }
                    this._persistHistory()
                } catch (error) {
                    reactError = error instanceof Error ? error.message : String(error)
                    console.error(`❌ [ReflectionAgent] ${phaseLabel} 阶段出错: ${reactError}`)
                    break
                }
            }

            // 本轮未产出答案（出错或工具循环未收敛）
            if (!currentAnswer) {
                const reason = reactError
                    ? `执行出错: ${reactError}`
                    : `${phaseLabel} 阶段工具循环超过 ${MAX_REACT_ITERATIONS} 次未收敛`
                if (isFirstRound) {
                    // 第一轮即无答案，无法进入反思，直接返回错误
                    return reason
                }
                // 后续轮次出错/未收敛：明确提示并返回上一轮已收集的答案（在重新收集前已清空，故提示降级）
                console.warn(`⚠️  [ReflectionAgent] ${reason}，本轮修订失败`)
                return `（本轮修订未完成：${reason}）`
            }

            // --- Phase 2: Reflect ---
            console.log(`🔍 [ReflectionAgent] 开始反思当前答案...`)
            const reflection = await this._reflect(currentAnswer)
            lastReflection = reflection

            console.log(`   📊 评分: ${reflection.score}/10 | ${reflection.pass ? '✅ 通过' : '❌ 需改进'}`)
            if (reflection.issues.length > 0) {
                console.log(`   ⚠️  问题 (${reflection.issues.length}):`)
                reflection.issues.forEach(i => console.log(`      - ${i}`))
            }
            if (reflection.suggestions.length > 0) {
                console.log(`   💡 建议 (${reflection.suggestions.length}):`)
                reflection.suggestions.forEach(s => console.log(`      - ${s}`))
            }
            console.log(`   📝 ${reflection.summary}`)

            // 反思通过 → 收敛
            if (reflection.pass) {
                console.log(`\n🏁 [ReflectionAgent] 答案通过反思审查，第 ${iteration} 轮收敛`)
                break
            }

            // 最后一轮不通过也不再修订
            if (iteration === this._max_iterations) {
                console.log(`\n⚠️  [ReflectionAgent] 已达最大迭代次数 ${this._max_iterations}，返回当前答案`)
            }
        }

        console.log(`\n✅ [ReflectionAgent] 最终答案:\n${currentAnswer}`)
        return currentAnswer
    }

    /** 重置会话 */
    reset() {
        this._history_message = [
            { role: 'system', content: reflectionAgentSystemPrompt() }
        ]
        this._store.delete(this._sessionId)
        this._sessionId = `session_${Date.now()}`
    }

    /**
     * 纯 LLM 调用：自我批判当前答案
     *
     * 反思是独立的一次性推理，使用临时 messages 数组（不污染主对话历史），
     * 与 PlanSolveAgent 的 plan() 设计一致。LLM 调用与 JSON 解析均做容错，
     * 不会因 API 失败或格式异常中断整个 Agent。
     */
    private async _reflect(currentAnswer: string): Promise<ReflectionResult> {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            // 评估维度 + 输出格式作为 system 指令；被评估答案作为 user 消息。
            // 必须含 user 消息：z.ai 兼容端点要求 messages 至少有一条非 system 角色，
            // 纯 system 请求会被拒为 400 "messages parameter is illegal"（与 PlanSolveAgent.plan() 一致）。
            { role: 'system', content: reflectionAgentReflectSystemPrompt() },
            { role: 'user', content: currentAnswer },
        ]

        let content = ''
        try {
            const response = await this._llm_client.call(messages, [])
            await logger.info(JSON.stringify(response))
            content = response.content || ''
        } catch (error) {
            const errMsg = `反思阶段 LLM 调用失败: ${error instanceof Error ? error.message : String(error)}`
            console.error(`⚠️  [ReflectionAgent] ${errMsg}`)
            await logger.error(errMsg)
            return {
                pass: false,
                score: 0,
                issues: [errMsg],
                suggestions: [],
                summary: '反思 LLM 调用失败，需重试'
            }
        }

        try {
            // 尝试从 markdown 代码块或纯文本中提取 JSON
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
            const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim()
            const result = JSON.parse(jsonStr) as ReflectionResult

            // 兜底验证字段类型
            return {
                pass: typeof result.pass === 'boolean' ? result.pass : false,
                score: typeof result.score === 'number' ? result.score : 5,
                issues: Array.isArray(result.issues) ? result.issues : [],
                suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
                summary: typeof result.summary === 'string' ? result.summary : '反思完成'
            }
        } catch (error) {
            console.error(`⚠️  [ReflectionAgent] 解析反思结果失败: ${error}`)
            // 解析失败默认认为需要改进
            return {
                pass: false,
                score: 5,
                issues: ['反思结果解析失败，需人工审查'],
                suggestions: ['请重新生成答案'],
                summary: '反思结果格式异常'
            }
        }
    }

    /** 将上一轮反思结果格式化为本轮 Revise 的修订指令（反馈链路的关键环节） */
    private _formatReflectionForRevise(reflection: ReflectionResult): string {
        const issuesText = reflection.issues.length > 0
            ? reflection.issues.map((i, idx) => `  ${idx + 1}. ${i}`).join('\n')
            : '  （反思未明确指出具体问题）'
        const suggestionsText = reflection.suggestions.length > 0
            ? reflection.suggestions.map((s, idx) => `  ${idx + 1}. ${s}`).join('\n')
            : '  （无具体改进建议）'

        return `上一轮反思（评分 ${reflection.score}/10）指出了以下问题，请基于反馈重新生成/改进你的答案：

## 发现的问题
${issuesText}

## 改进建议
${suggestionsText}

## 反思总结
${reflection.summary}

请针对上述问题逐一修正，给出改进后的完整答案。`
    }

    /** 持久化当前对话历史 */
    private _persistHistory() {
        this._store.save(this._sessionId, this._history_message)
    }

    /** 调用 LLM，将响应追加到 history 并记录日志 */
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
