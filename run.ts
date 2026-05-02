import { ReactAgent } from "./react_agent"
import { write_file, read_file, exec_command } from "./tools"
import { write_file_definition, read_file_definition, exec_command_definition } from "./tool_definition";


async function main() {
    const react_agent = new ReactAgent()
    react_agent.registerTool('write_file', write_file, write_file_definition)
    react_agent.registerTool('read_file', read_file, read_file_definition)
    react_agent.registerTool('exec_command', exec_command, exec_command_definition)
    await react_agent.run("整理workspace/snake_game.py程序的设计文档，输出markdown到同级路径下。")

}

main().catch(console.error)
