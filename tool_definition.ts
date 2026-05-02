import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const ReadFileSchema = z.object({
    file_path: z.string().describe("文件路径")
})

export const WriteFileSchema = z.object({
    file_path: z.string().describe("文件路径"),
    content: z.string().describe("文件内容")
})

export const ExecCommandSchema = z.object({
    command: z.string().describe("命令行指令")
})

export const exec_command_definition = {
    name: 'exec_command',
    description: '执行命令行指令',
    parameters: zodToJsonSchema(ExecCommandSchema),
}

export const read_file_definition = {
    name: 'read_file',
    description: '读取指定路径下的文件',
    parameters: zodToJsonSchema(ReadFileSchema),
}

export const write_file_definition = {
    name: 'write_file',
    description: '在指定路径下写文件',
    parameters: zodToJsonSchema(WriteFileSchema),
}


