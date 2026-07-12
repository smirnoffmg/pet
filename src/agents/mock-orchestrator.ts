import type { BaseMessageLike } from "@langchain/core/messages";
import type { PdtLogger } from "@/log.js";

export type ChatTurnResult = { messages: unknown[] };

export type ChatTurnAgent = {
  invoke(input: { messages: BaseMessageLike[] }): Promise<ChatTurnResult>;
};

const MOCK_REPLY =
  "[pet chat mock] PET_MOCK_AGENTS=1 — no LLM call made. Unset it and configure a provider API key for real orchestrator responses.";

export function createMockOrchestratorAgent(docRoot: string, logger: PdtLogger): ChatTurnAgent {
  void docRoot;
  return {
    invoke: ({ messages }) => {
      logger.verbose("Mock orchestrator turn (PET_MOCK_AGENTS=1)");
      return Promise.resolve({
        messages: [...messages, { type: "ai", content: MOCK_REPLY }],
      });
    },
  };
}
