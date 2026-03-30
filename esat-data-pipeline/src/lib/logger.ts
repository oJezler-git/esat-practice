type LogLevel = "debug" | "info" | "warn" | "error";

type LogPayload = Record<string, unknown> | Error | undefined;

interface Logger {
  debug: (message: string, payload?: LogPayload) => void;
  info: (message: string, payload?: LogPayload) => void;
  warn: (message: string, payload?: LogPayload) => void;
  error: (message: string, payload?: LogPayload) => void;
  child: (scope: string) => Logger;
  timeAsync: <T>(
    operation: string,
    run: () => Promise<T>,
    payload?: LogPayload,
  ) => Promise<T>;
}

const DEV_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_DEBUG_LOGS !== "0";
const ROOT_NAMESPACE = "esat";

function getConsoleMethod(level: LogLevel): (...data: unknown[]) => void {
  switch (level) {
    case "debug":
      return console.debug;
    case "info":
      return console.info;
    case "warn":
      return console.warn;
    case "error":
      return console.error;
  }
}

function normalisePayload(payload?: LogPayload): unknown {
  if (!payload) return undefined;
  if (payload instanceof Error) {
    return {
      name: payload.name,
      message: payload.message,
      stack: payload.stack,
    };
  }
  return payload;
}

function log(
  level: LogLevel,
  namespace: string,
  message: string,
  payload?: LogPayload,
) {
  if (!DEV_ENABLED) return;
  const prefix = `[${ROOT_NAMESPACE}:${namespace}]`;
  const method = getConsoleMethod(level);
  const normalized = normalisePayload(payload);
  if (normalized === undefined) {
    method(`${prefix} ${message}`);
    return;
  }
  method(`${prefix} ${message}`, normalized);
}

function makeLogger(namespace: string): Logger {
  return {
    debug: (message, payload) => log("debug", namespace, message, payload),
    info: (message, payload) => log("info", namespace, message, payload),
    warn: (message, payload) => log("warn", namespace, message, payload),
    error: (message, payload) => log("error", namespace, message, payload),
    child: (scope: string) => makeLogger(`${namespace}:${scope}`),
    async timeAsync<T>(
      operation: string,
      run: () => Promise<T>,
      payload?: LogPayload,
    ): Promise<T> {
      if (!DEV_ENABLED) {
        return run();
      }
      const start = performance.now();
      log("debug", namespace, `${operation}:start`, payload);
      try {
        const result = await run();
        const elapsedMs = Math.round(performance.now() - start);
        log("info", namespace, `${operation}:done`, {
          elapsed_ms: elapsedMs,
          ...(payload ?? {}),
        });
        return result;
      } catch (error) {
        const elapsedMs = Math.round(performance.now() - start);
        log("error", namespace, `${operation}:failed`, {
          elapsed_ms: elapsedMs,
          error: normalisePayload(
            error instanceof Error
              ? error
              : new Error(typeof error === "string" ? error : "Unknown error"),
          ),
          ...(payload ?? {}),
        });
        throw error;
      }
    },
  };
}

export function createLogger(namespace: string): Logger {
  return makeLogger(namespace);
}
