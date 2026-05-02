import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { z } from 'zod'
import { ReadFileSchema, WriteFileSchema, ExecCommandSchema } from './tool_definition'


type ReadFileParams = z.infer<typeof ReadFileSchema>
type WriteFileParams = z.infer<typeof WriteFileSchema>
type ExecCommandParams = z.infer<typeof ExecCommandSchema>

export async function read_file(params: ReadFileParams) {
    const { file_path } = ReadFileSchema.parse(params)
    try{
        if (!await fs.access(file_path, fs.constants.F_OK).then(() => true).catch(() => false)) {
            throw new Error(`read file fail, ${file_path} not found`)
        }
        const content = await fs.readFile(file_path, 'utf-8')
        return String(content)
    } catch (error) {
        throw new Error(`read ${file_path} fail: ${ error instanceof Error ? error.message : String(error) }`)
    }
}

export async function write_file(params: WriteFileParams) {
    const { file_path, content } = WriteFileSchema.parse(params)
    try {
        await fs.mkdir(path.dirname(file_path), { recursive: true });
        await fs.writeFile(file_path, content);
        return `write file ${file_path} success`
    } catch (error) {
        throw new Error(`write file fail: ${error instanceof Error ? error.message : String(error)}`)
    }
}

export async function exec_command(params: ExecCommandParams) {
    const { command } = ExecCommandSchema.parse(params)
    return new Promise((resolve, reject) => {
        exec(command, { timeout: 30000 }, (error: Error | null, stdout: string, stderr: string) => {
            if (error) {
                // 超时或其他执行错误
                const output = stdout ? `\nstdout: ${stdout}` : ''
                reject(`exec command fail: ${error.message}${output}`);
            } else if (stderr) {
                reject(`exec command error: ${stderr}`);
            } else {
                resolve(stdout);
            }
        });
    });
}

