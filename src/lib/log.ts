/**
 * Minimal structured logger.
 *
 * .NET analogy: ILogger with a console sink plus an in-memory ring buffer.
 * Entries go to the browser console (filterable by the [turntable] prefix),
 * are kept in memory, and the last few hundred are mirrored to localStorage
 * so a crash or reload doesn't lose them. Press L in the app to download.
 *
 * Usage: log.info('player', 'ready', { deviceId })
 */

export type Level = 'debug' | 'info' | 'warn' | 'error'

export interface Entry {
  t: string            // ISO timestamp
  level: Level
  scope: string        // 'auth' | 'api' | 'player' | 'app' ...
  msg: string
  data?: unknown
}

const MAX = 500
const KEY = 'turntable.log'
const buffer: Entry[] = []

// Restore what the previous session left behind.
try {
  const prev = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Entry[]
  buffer.push(...prev.slice(-MAX))
} catch { /* ignore corrupt log */ }

let flushTimer = 0
function scheduleFlush() {
  if (flushTimer) return
  flushTimer = window.setTimeout(() => {
    flushTimer = 0
    try { localStorage.setItem(KEY, JSON.stringify(buffer)) } catch { /* quota */ }
  }, 500)
}

/** Serialise Errors properly; JSON.stringify drops their message otherwise. */
function plain(data: unknown): unknown {
  if (data instanceof Error) {
    return { name: data.name, message: data.message, ...(data as object), stack: data.stack }
  }
  return data
}

function write(level: Level, scope: string, msg: string, data?: unknown) {
  const entry: Entry = { t: new Date().toISOString(), level, scope, msg }
  if (data !== undefined) entry.data = plain(data)
  buffer.push(entry)
  if (buffer.length > MAX) buffer.shift()
  scheduleFlush()

  const fn = level === 'debug' ? console.debug : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error
  fn(`[turntable:${scope}] ${msg}`, data ?? '')
}

export const log = {
  debug: (scope: string, msg: string, data?: unknown) => write('debug', scope, msg, data),
  info:  (scope: string, msg: string, data?: unknown) => write('info',  scope, msg, data),
  warn:  (scope: string, msg: string, data?: unknown) => write('warn',  scope, msg, data),
  error: (scope: string, msg: string, data?: unknown) => write('error', scope, msg, data),

  entries: () => [...buffer],

  clear: () => {
    buffer.length = 0
    localStorage.removeItem(KEY)
  },

  /** Trigger a browser download of the log as newline-delimited JSON. */
  download: () => {
    const body = buffer.map((e) => JSON.stringify(e)).join('\n')
    const blob = new Blob([body], { type: 'application/x-ndjson' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `turntable-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    a.click()
    URL.revokeObjectURL(a.href)
  },
}

// Catch anything that escaped a try/catch, including rejected promises.
window.addEventListener('error', (e) => log.error('window', 'uncaught error', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => log.error('window', 'unhandled rejection', e.reason))

// Handy from the devtools console: window.turntableLog.download()
;(window as unknown as { turntableLog: typeof log }).turntableLog = log
