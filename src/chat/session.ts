import type { BaseMessageLike } from "@langchain/core/messages";
import { input } from "@inquirer/prompts";
import { loadConfig } from "@/config.js";
import { createLogger } from "@/log.js";
import { docRoot } from "@/store/repo-root.js";
import { ProviderConfigError } from "@/errors/index.js";
import { createChatOrchestratorAgent, runOrchestratorTurn } from "@/agents/orchestrator-session.js";

const EXIT_COMMANDS = new Set([".exit", "exit", "quit"]);

function isExitPromptError(e: unknown): boolean {
  return e instanceof Error && e.name === "ExitPromptError";
}

export async function runChatSession(opts: { repoRoot: string }): Promise<void> {
  process.stdout.write(
    "Welcome to pet chat. Ask about your pipeline, or tell me what to do next. Type .exit to leave.\n",
  );

  const root = docRoot(opts.repoRoot);
  const logger = createLogger({ verbose: loadConfig().verbose });

  let agent: Awaited<ReturnType<typeof createChatOrchestratorAgent>>;
  try {
    agent = await createChatOrchestratorAgent(root, logger);
  } catch (e) {
    if (e instanceof ProviderConfigError) {
      process.stderr.write(
        `pet chat requires a configured LLM provider — set ANTHROPIC_API_KEY (or the relevant provider key), or set PET_MOCK_AGENTS=1 for a scripted mock session.\n${e.message}\n`,
      );
      return;
    }
    throw e;
  }

  let messages: BaseMessageLike[] = [];

  for (;;) {
    let userInput: string;
    try {
      userInput = await input({ message: "You" });
    } catch (e) {
      if (isExitPromptError(e)) {
        process.stdout.write("\nGoodbye.\n");
        return;
      }
      throw e;
    }

    const trimmed = userInput.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (EXIT_COMMANDS.has(trimmed.toLowerCase())) {
      process.stdout.write("Goodbye.\n");
      return;
    }

    const turn = await runOrchestratorTurn(agent, messages, trimmed);
    messages = turn.messages;
    process.stdout.write(`${turn.reply}\n`);
  }
}
