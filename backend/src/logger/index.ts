import { getContext } from '../context/request-context.js'

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

// Plain JSON — used in production / CI / non-TTY pipes
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

// Colored human-readable output — used when stdout is a TTY (dev terminal / JS Debug Terminal)
const C = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  gray:   '\x1b[90m',
}

const LEVEL_FMT: Record<LogLevel, string> = {
  debug: `${C.gray}debug${C.reset}`,
  info:  `${C.cyan}info ${C.reset}`,
  warn:  `${C.yellow}warn ${C.reset}`,
  error: `${C.red}error${C.reset}`,
}

export function prettyTransport(entry: LogEntry): void {
  const time = new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour12: false })
  const ctx = Object.keys(entry.context).length
    ? `  ${C.gray}${JSON.stringify(entry.context)}${C.reset}`
    : ''
  const line = `${C.dim}${time}${C.reset}  ${LEVEL_FMT[entry.level]}  ${entry.message}${ctx}`
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
    this.transports = [process.stdout.isTTY ? prettyTransport : consoleTransport]
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
    const ctx = getContext()
    const traceFields: LogContext = ctx
      ? { traceId: ctx.traceId, tenantId: ctx.tenantId, initiatorId: ctx.initiatorId, isM2M: ctx.isM2M }
      : {}
    const entry: LogEntry = {
      level,
      message,
      context: { ...traceFields, ...context },
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
