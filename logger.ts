import fs from 'fs/promises';
import path from 'path';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  [key: string]: any; // 允许额外字段
}

class JsonLogger {
  private logFilePath: string;
  
  constructor(logFileName: string = 'app.log.jsonl') {
    this.logFilePath = path.join(process.cwd(), 'logs', logFileName);
  }
  
  private async ensureLogDirectory() {
    const logDir = path.dirname(this.logFilePath);
    try {
      await fs.access(logDir);
    } catch {
      await fs.mkdir(logDir, { recursive: true });
    }
  }
  
  private async writeLog(entry: LogEntry) {
    await this.ensureLogDirectory();

    // 追加写入单行 JSON，避免 read-modify-write 竞态条件
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.logFilePath, line, 'utf-8');
  }
  
  async log(level: LogEntry['level'], message: string, meta?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta
    };
    
    await this.writeLog(entry);
  }
  
  async info(message: string, meta?: any) {
    await this.log('info', message, meta);
  }
  
  async warn(message: string, meta?: any) {
    await this.log('warn', message, meta);
  }
  
  async error(message: string, meta?: any) {
    await this.log('error', message, meta);
  }
  
  async debug(message: string, meta?: any) {
    await this.log('debug', message, meta);
  }
}


export const logger = new JsonLogger();