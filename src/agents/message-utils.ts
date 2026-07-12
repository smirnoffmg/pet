export function countMessages(result: unknown): string {
  if (typeof result !== "object" || result === null || !("messages" in result)) {
    return "?";
  }
  const messages = (result as { messages: unknown }).messages;
  return Array.isArray(messages) ? String(messages.length) : "?";
}

export function extractLastAssistantText(result: unknown): string | null {
  if (typeof result !== "object" || result === null || !("messages" in result)) {
    return null;
  }
  const messages = (result as { messages: unknown[] }).messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (typeof m !== "object" || m === null) {
      continue;
    }
    const type = "type" in m ? String((m as { type: unknown }).type) : "";
    if (type !== "ai" && type !== "AIMessage") {
      continue;
    }
    const content = "content" in m ? (m as { content: unknown }).content : null;
    if (typeof content === "string" && content.trim().length > 0) {
      return content.trim();
    }
  }
  return null;
}
