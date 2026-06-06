import { createDeepAgent, FilesystemBackend } from "deepagents";
import { createModel } from "@/llm/provider-factory.js";
import { loadPrompt } from "./load-prompt.js";
import { permissionsForRole } from "./path-permissions.js";
import { createOrchestratorTools } from "./orchestrator-tools.js";
import type { PdtLogger } from "@/log.js";

export async function createOrchestratorAgent(docRoot: string, logger: PdtLogger) {
  const tools = createOrchestratorTools(docRoot, logger);

  const backend = new FilesystemBackend({
    rootDir: docRoot,
    virtualMode: true,
  });

  return createDeepAgent({
    model: await createModel(),
    systemPrompt: loadPrompt("orchestrator"),
    backend,
    tools: [...tools],
    permissions: permissionsForRole("orchestrator"),
    name: "pet-orchestrator",
  });
}
