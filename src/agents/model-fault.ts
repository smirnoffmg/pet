/**
 * Distinguishes "the model misbehaved and the system refused it" from "the code
 * broke".
 *
 * A weak or unlucky model invents a path outside its allow-list, or emits a tool
 * call that does not fit a schema the code defines correctly. The permission
 * layer and the tool layer reject both — which is them working — but the harness
 * surfaces the rejection as a thrown error that aborts the run. Reported as a
 * crash, it accuses the wrong party.
 */

const FAULT_PATTERNS = [
  /permission denied for (?:write|read|edit) on /i,
  /tool input did not match expected schema/i,
  /path must not contain/i,
];

function collectMessages(error: unknown, depth = 0): string[] {
  if (error === null || error === undefined || depth > 8) return [];

  const out: string[] = [];

  if (error instanceof Error) {
    out.push(error.message);
    const nested = (error as { errors?: unknown }).errors;
    if (Array.isArray(nested)) {
      for (const inner of nested) out.push(...collectMessages(inner, depth + 1));
    }
    out.push(...collectMessages((error as { cause?: unknown }).cause, depth + 1));
    return out;
  }

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record["message"] === "string") out.push(record["message"]);
    if (Array.isArray(record["errors"])) {
      for (const inner of record["errors"]) out.push(...collectMessages(inner, depth + 1));
    }
    out.push(...collectMessages(record["cause"], depth + 1));
    return out;
  }

  if (typeof error === "string") out.push(error);
  return out;
}

/** Every underlying failure was the system refusing invalid model behaviour. */
export function isModelFault(error: unknown): boolean {
  const messages = collectMessages(error).filter((m) => m.length > 0);
  if (messages.length === 0) return false;
  return messages.every((m) => FAULT_PATTERNS.some((p) => p.test(m)));
}

/** A one-line reason suitable for an operator-facing log. */
export function describeModelFault(error: unknown): string {
  for (const message of collectMessages(error)) {
    for (const pattern of FAULT_PATTERNS) {
      if (pattern.test(message)) return message.split("\n")[0]!.trim();
    }
  }
  return "invalid model behaviour";
}

/** Same classification against captured process output rather than an error object. */
export function outputShowsModelFault(text: string): boolean {
  return FAULT_PATTERNS.some((p) => p.test(text));
}
