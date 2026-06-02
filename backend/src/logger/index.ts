export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  [key: string]: unknown
}

export interface LogEntry {
  level: LogLevel
  message: string
  context: LogContext
  timestamp: string
}

export type LogTransport = (entry: LogEntry) => void

export function consoleTransport(entry: LogEntry): void {
  const line = JSON.stringify({
    time: entry.timestamp,
    level: entry.level,
    msg: entry.message,
    ...entry.context,
  })
  if (entry.level === 'error' || entry.level === 'warn') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}

export class Logger {
  private static instance: Logger | null = null
  private transports: LogTransport[]

  private constructor() {
    this.transports = [consoleTransport]
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  addTransport(transport: LogTransport): void {
    this.transports.push(transport)
  }

  clearTransports(): void {
    this.transports = []
  }

  private emit(level: LogLevel, message: string, context: LogContext = {}): void {
    const entry: LogEntry = {
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
    }
    for (const transport of this.transports) {
      transport(entry)
    }
  }

  debug(message: string, context?: LogContext): void {
    this.emit('debug', message, context)
  }

  info(message: string, context?: LogContext): void {
    this.emit('info', message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.emit('warn', message, context)
  }

  error(message: string, context?: LogContext): void {
    this.emit('error', message, context)
  }
}

export const logger = Logger.getInstance()
