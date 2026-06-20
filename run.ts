import { ReactAgent } from "./agent/react_agent/react_agent"
import { PlanSolveAgent } from "./agent/plan_solve_agent/plan_solve_agent"
import { ReflectionAgent } from "./agent/reflection_agent/reflection_agent"
import { write_file, read_file, exec_command } from "./util/tools"
import { write_file_definition, read_file_definition, exec_command_definition } from "./util/tool_definition";


async function main() {
    // const agent = new ReactAgent()
    // const agent = new PlanSolveAgent()
    const agent = new ReflectionAgent(undefined, 3)  // sessionId 自动生成，最大 3 轮迭代
    agent.toolExecutor.registerTool('write_file', write_file, write_file_definition)
    agent.toolExecutor.registerTool('read_file', read_file, read_file_definition)
    agent.toolExecutor.registerTool('exec_command', exec_command, exec_command_definition)
    await agent.run("在workspace路径下编写一个Python函数，找出1到n之间所有的素数 (prime numbers)")

}

main().catch(console.error)
