export type ConversationLogger = {
  log: (category: string, message: string, data?: unknown) => void
}

const toJsonSafe = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: (value as { cause?: unknown }).cause,
    }
  }

  try {
    JSON.stringify(value)
    return value
  } catch {
    try {
      return String(value)
    } catch {
      return '[Unserializable]'
    }
  }
}

const emitLog = (entry: Record<string, unknown>) => {
  console.log(JSON.stringify(entry))
}

const fallbackLogger: ConversationLogger = {
  log: (category, message, data) => {
    const entry: Record<string, unknown> = {
      ts: Date.now(),
      cat: category,
      msg: message,
    }
    if (data !== undefined) entry.data = toJsonSafe(data)
    emitLog(entry)
  },
}

export const getLogger = (): ConversationLogger => fallbackLogger

export const enterLoggerContext = (logger: ConversationLogger) => {
  void logger
}

export const createConversationLogger = (): ConversationLogger => {
  const requestId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10)

  return {
    log: (category: string, message: string, data?: unknown) => {
      const entry: Record<string, unknown> = {
        ts: Date.now(),
        cat: category,
        rid: requestId,
        msg: message,
      }
      if (data !== undefined) entry.data = toJsonSafe(data)
      emitLog(entry)
    },
  }
}
