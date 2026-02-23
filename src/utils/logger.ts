type LogLevel = "info" | "warn" | "error" | "debug";

function log(level: LogLevel, message: unknown, fields?: Record<string, unknown>) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  console.log(JSON.stringify(entry));
}

export const logger = {
  info: (message: unknown, fields?: Record<string, unknown>) => log("info", message, fields),
  warn: (message: unknown, fields?: Record<string, unknown>) => log("warn", message, fields),
  error: (message: unknown, fields?: Record<string, unknown>) => log("error", message, fields),
  debug: (message: unknown, fields?: Record<string, unknown>) => log("debug", message, fields),
};
