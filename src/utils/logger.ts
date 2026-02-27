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

/**
 * Returns a function that, when called, returns the elapsed milliseconds
 * since `time()` was invoked.
 *
 * Usage:
 *   const elapsed = logger.time();
 *   // ... do work ...
 *   logger.info("done", { latencyMs: elapsed() });
 */
function time(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

export const logger = {
  info: (message: unknown, fields?: Record<string, unknown>) => log("info", message, fields),
  warn: (message: unknown, fields?: Record<string, unknown>) => log("warn", message, fields),
  error: (message: unknown, fields?: Record<string, unknown>) => log("error", message, fields),
  debug: (message: unknown, fields?: Record<string, unknown>) => log("debug", message, fields),
  time,
};
