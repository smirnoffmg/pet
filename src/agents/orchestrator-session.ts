import type { BaseMessageLike } from "@langchain/core/messages";
import { loadConfig } from "@/config.js";
import type { PdtLogger } from "@/log.js";
import { createOrchestratorAgent } from "./orchestrator.js";
import { createMockOrchestratorAgent } from "./mock-orchestrator.js";
import { extractLastAssistantText } from "./message-utils.js";

export type { ChatTurnAgent } from "./mock-orchestrator.js";
import type { ChatTurnAgent } from "./mock-orchestrator.js";

export async function createChatOrchestratorAgent(
  docRoot: string,
  logger: PdtLogger,
): Promise<ChatTurnAgent> {
  if (loadConfig().mockAgents) {
    logger.verbose("Using mock orchestrator agent (PET_MOCK_AGENTS=1)");
    return createMockOrchestratorAgent(docRoot, logger);
  }
  const agent = await createOrchestratorAgent(docRoot, logger);
  return {
    invoke: async (input) => {
      const result: unknown = await agent.invoke(input);
      const messages = (result as { messages?: unknown[] }).messages ?? [];
      return { messages };
    },
  };
}

export type OrchestratorTurn = {
  messages: BaseMessageLike[];
  reply: string;
};

export async function runOrchestratorTurn(
  agent: ChatTurnAgent,
  messages: BaseMessageLike[],
  userInput: string,
): Promise<OrchestratorTurn> {
  const turnInput: BaseMessageLike[] = [...messages, { role: "user", content: userInput }];
  const result = await agent.invoke({ messages: turnInput });
  return {
    messages: result.messages as BaseMessageLike[],
    reply: extractLastAssistantText(result) ?? "(no response)",
  };
}
