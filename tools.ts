import fs from 'fs/promises'
import path from 'path'
import { z } from 'zod'
import { ReadFileSchema, WriteFileSchema } from './tool_definition'

type ReadFileParams = z.infer<typeof ReadFileSchema>
type WriteFileParams = z.infer<typeof WriteFileSchema>

export async function read_file(params: ReadFileParams) {
    const { file_path } = ReadFileSchema.parse(params)
    try{
        if (!await fs.exists(file_path)) {
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
    } catch (error) {
        throw new Error(`write file fail: ${error instanceof Error ? error.message : String(error)}`)
    }
}

