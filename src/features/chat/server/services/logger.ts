import fs from "fs";
import path from "path";
import { AsyncLocalStorage } from "node:async_hooks";

export type ConversationLogger = {
  log: (category: string, message: string, data?: unknown) => void;
};

const LOG_BASE_DIR = path.join(process.cwd(), "logs", "conversations");

const ensureLogDirectory = () => {
  try {
    if (!fs.existsSync(LOG_BASE_DIR)) {
      fs.mkdirSync(LOG_BASE_DIR, { recursive: true });
    }
  } catch {
    // Silently fail - directory creation errors are non-critical
  }
};

const formatTimestamp = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  const timezoneOffset = -date.getTimezoneOffset();
  const offsetHours = String(
    Math.floor(Math.abs(timezoneOffset) / 60)
  ).padStart(2, "0");
  const offsetMinutes = String(Math.abs(timezoneOffset) % 60).padStart(2, "0");
  const offsetSign = timezoneOffset >= 0 ? "+" : "-";

  return `${year}-${month}-${day}T${hours}-${minutes}-${seconds}-${milliseconds}${offsetSign}${offsetHours}${offsetMinutes}`;
};

const safeSerialize = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    const errorInfo = {
      ...value, // 1. 先展开其他可能的自定义属性
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: (value as { cause?: unknown }).cause, // 2. 使用更安全的类型断言替代 any
    };
    try {
      return JSON.stringify(errorInfo, null, 2);
    } catch {
      return `[Error: ${value.message}]`;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    try {
      return String(value);
    } catch {
      return "[Unserializable]";
    }
  }
};

const loggerStorage = new AsyncLocalStorage<ConversationLogger>();

const fallbackLogger: ConversationLogger = {
  log: (category, message, data) => {
    console.log(`[${category}]`, message, data);
  },
};

export const getLogger = (): ConversationLogger =>
  loggerStorage.getStore() ?? fallbackLogger;

export const enterLoggerContext = (logger: ConversationLogger) =>
  loggerStorage.enterWith(logger);

export const createConversationLogger = (): ConversationLogger => {
  const shouldWriteToFile = process.env.NODE_ENV !== "production";
  const creationTime = new Date();
  const timestampPrefix = formatTimestamp(creationTime);

  if (shouldWriteToFile) {
    ensureLogDirectory();
  }

  const filePath = path.join(LOG_BASE_DIR, `${timestampPrefix}.log`);

  const appendLine = (category: string, message: string, data?: unknown) => {
    if (!shouldWriteToFile) {
      return;
    }

    const timestamp = new Date().toISOString();
    let line = `[${timestamp}] [${category}] ${message}`;

    if (data !== undefined) {
      const serializedData = safeSerialize(data);
      line += `\n${serializedData}`;
    }

    line += "\n";

    try {
      fs.appendFile(filePath, line, () => {
        // Silently fail - log write errors are non-critical
      });
    } catch {
      // Silently fail - logging errors should not crash the application
    }
  };

  return {
    log: (category: string, message: string, data?: unknown) => {
      appendLine(category, message, data);
      console.log(`[${category}]`, message, data);
    },
  };
};
