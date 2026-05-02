import fs from 'fs'
import path from 'path'

const DEFAULT_STORE_DIR = path.join(__dirname, 'workspace', 'sessions')

export class ConversationStore {
    private _dir: string

    constructor(dir = DEFAULT_STORE_DIR) {
        this._dir = dir
        fs.mkdirSync(dir, { recursive: true })
    }

    save(sessionId: string, messages: unknown[]): void {
        const fp = path.join(this._dir, `${sessionId}.jsonl`)
        const data = messages.map(m => JSON.stringify(m)).join('\n')
        fs.writeFileSync(fp, data, 'utf-8')
    }

    load(sessionId: string): unknown[] {
        const fp = path.join(this._dir, `${sessionId}.jsonl`)
        if (!fs.existsSync(fp)) return []
        const content = fs.readFileSync(fp, 'utf-8')
        return content.split('\n').filter(Boolean).map(line => JSON.parse(line))
    }

    list(): string[] {
        return fs.readdirSync(this._dir)
            .filter(f => f.endsWith('.jsonl'))
            .map(f => f.replace('.jsonl', ''))
    }

    delete(sessionId: string): boolean {
        const fp = path.join(this._dir, `${sessionId}.jsonl`)
        if (!fs.existsSync(fp)) return false
        fs.unlinkSync(fp)
        return true
    }
}
