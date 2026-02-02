import pino from "pino";

const DEFAULT_LEVEL = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug");

/**
 * Shared application logger configured for production-friendly structured logs.
 */
const rootLogger = pino({
  level: DEFAULT_LEVEL
});

/**
 * Returns a scoped logger instance with the provided `scope` label.
 */
export function getLogger(scope: string) {
  return rootLogger.child({ scope });
}

export type AppLogger = ReturnType<typeof getLogger>;
