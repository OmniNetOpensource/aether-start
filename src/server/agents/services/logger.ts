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

export const log = (category: string, message: string, data?: unknown) => {
  const entry: Record<string, unknown> = {
    ts: Date.now(),
    cat: category,
    msg: message,
  }

  if (data !== undefined) {
    entry.data = toJsonSafe(data)
  }

  emitLog(entry)
}
