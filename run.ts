import { ReactAgent } from "./agent/react_agent/react_agent"
import { PlanSolveAgent } from "./agent/plan_solve_agent/plan_solve_agent"
import { write_file, read_file, exec_command } from "./util/tools"
import { write_file_definition, read_file_definition, exec_command_definition } from "./util/tool_definition";


async function main() {
    // const agent = new ReactAgent()
    const agent = new PlanSolveAgent()
    agent.toolExecutor.registerTool('write_file', write_file, write_file_definition)
    agent.toolExecutor.registerTool('read_file', read_file, read_file_definition)
    agent.toolExecutor.registerTool('exec_command', exec_command, exec_command_definition)
    await agent.run("在workspace路径下创建五子棋小游戏，实现后直接运行启动游戏")

}

main().catch(console.error)
