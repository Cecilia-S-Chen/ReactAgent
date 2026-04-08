import { ReactAgent } from "./react_agent"
import { write_file, read_file } from "./tools"
import { write_file_definition, read_file_definition } from "./tool_definition";


async function main() {
    const react_agent = new ReactAgent()
    react_agent.registerTool('write_file', write_file, write_file_definition)
    react_agent.registerTool('read_file', read_file, read_file_definition)
    await react_agent.run("读取文件/Users/shuochen/Project/Agent/Readme.md内容")

}

main().catch(console.error)
