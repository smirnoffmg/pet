import fs from "node:fs";
import path from "node:path";

export type LoggerOptions = {
  verbose: boolean;
  /** When set, every info/verbose line is appended here. */
  logPath?: string;
};

export type PdtLogger = {
  info: (message: string) => void;
  verbose: (message: string) => void;
  /** Always written to session log and stderr (API usage / artifact outcomes). */
  outcome: (message: string) => void;
};

export function isVerboseEnv(): boolean {
  return process.env["PET_VERBOSE"] === "1";
}

export function createLogger(options: LoggerOptions): PdtLogger {
  const write = (level: "info" | "verbose" | "outcome", message: string): void => {
    const line = `${new Date().toISOString()} [${level}] ${message}`;
    if (options.logPath) {
      fs.mkdirSync(path.dirname(options.logPath), { recursive: true });
      fs.appendFileSync(options.logPath, `${line}\n`, "utf8");
    }
    if (level === "outcome" || options.verbose) {
      process.stderr.write(`${line}\n`);
    }
  };

  return {
    info: (message) => write("info", message),
    verbose: (message) => write("verbose", message),
    outcome: (message) => write("outcome", message),
  };
}

export function ensureSessionLogPath(sessionPath: string): string {
  return path.join(sessionPath, "run.log");
}
