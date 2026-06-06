import { ChatAnthropic } from "@langchain/anthropic";
import { AzureChatOpenAI, ChatOpenAI } from "@langchain/openai";
import { ChatBedrockConverse } from "@langchain/aws";
import { ChatVertexAI } from "@langchain/google-vertexai";
import { ChatOllama } from "@langchain/ollama";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

const VALID_PROVIDERS = [
  "anthropic",
  "openai",
  "azure-openai",
  "bedrock",
  "vertex",
  "ollama",
] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

const PROVIDER_MODEL_DEFAULTS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  "azure-openai": "gpt-4o",
  bedrock: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  vertex: "gemini-1.5-pro",
  ollama: "",
};

const KNOWN_CAPABLE_OLLAMA_MODELS = ["llama3.3", "mistral-nemo", "qwen2.5:72b", "gemma3:27b"];

// Test seam (ADR-0016): set a pre-built stub to bypass all validation.
let _testOverride: BaseChatModel | null = null;

export function _setModelForTesting(model: BaseChatModel | null): void {
  _testOverride = model;
}

export function resolveProvider(): string {
  return process.env["PET_LLM_PROVIDER"] ?? "anthropic";
}

export function resolveModelId(): string {
  const provider = resolveProvider() as Provider;
  const override = process.env["PET_LLM_MODEL"];
  if (override) return override;
  return PROVIDER_MODEL_DEFAULTS[provider] ?? "unknown";
}

export async function createModel(): Promise<BaseChatModel> {
  if (_testOverride !== null) return _testOverride;

  const provider = resolveProvider();

  if (!VALID_PROVIDERS.includes(provider as Provider)) {
    throw new Error(
      `PET_LLM_PROVIDER="${provider}" is not supported. Valid options: ${VALID_PROVIDERS.join(", ")}`,
    );
  }

  const modelOverride = process.env["PET_LLM_MODEL"];

  switch (provider as Provider) {
    case "anthropic":
      return buildAnthropic(modelOverride);
    case "openai":
      return buildOpenAI(modelOverride);
    case "azure-openai":
      return buildAzureOpenAI(modelOverride);
    case "bedrock":
      return buildBedrock(modelOverride);
    case "vertex":
      return buildVertex(modelOverride);
    case "ollama":
      return buildOllama(modelOverride);
  }
}

function requireEnv(name: string, provider: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} is required when PET_LLM_PROVIDER=${provider}`);
  return val;
}

function buildAnthropic(modelOverride: string | undefined): BaseChatModel {
  requireEnv("ANTHROPIC_API_KEY", "anthropic");
  const anthropicApiUrl = process.env["PET_LLM_BASE_URL"];
  return new ChatAnthropic({
    model: modelOverride ?? PROVIDER_MODEL_DEFAULTS.anthropic,
    ...(anthropicApiUrl ? { anthropicApiUrl } : {}),
  });
}

function buildOpenAI(modelOverride: string | undefined): BaseChatModel {
  requireEnv("OPENAI_API_KEY", "openai");
  const baseURL = process.env["PET_LLM_BASE_URL"];
  return new ChatOpenAI({
    model: modelOverride ?? PROVIDER_MODEL_DEFAULTS.openai,
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });
}

function buildAzureOpenAI(modelOverride: string | undefined): BaseChatModel {
  requireEnv("AZURE_OPENAI_API_KEY", "azure-openai");
  requireEnv("AZURE_OPENAI_ENDPOINT", "azure-openai");
  return new AzureChatOpenAI({ model: modelOverride ?? PROVIDER_MODEL_DEFAULTS["azure-openai"] });
}

function buildBedrock(modelOverride: string | undefined): BaseChatModel {
  return new ChatBedrockConverse({
    model: modelOverride ?? PROVIDER_MODEL_DEFAULTS.bedrock,
    region: process.env["AWS_REGION"] ?? process.env["AWS_DEFAULT_REGION"] ?? "us-east-1",
  });
}

function buildVertex(modelOverride: string | undefined): BaseChatModel {
  requireEnv("GOOGLE_APPLICATION_CREDENTIALS", "vertex");
  return new ChatVertexAI({ model: modelOverride ?? PROVIDER_MODEL_DEFAULTS.vertex });
}

async function buildOllama(modelOverride: string | undefined): Promise<BaseChatModel> {
  const model = modelOverride;
  if (!model) {
    throw new Error("PET_LLM_MODEL is required when PET_LLM_PROVIDER=ollama");
  }

  const baseUrl = process.env["PET_LLM_BASE_URL"] ?? "http://localhost:11434";

  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    throw new Error(
      `Ollama server unreachable at PET_LLM_BASE_URL=${baseUrl}. Start it with: ollama serve (${String(err)})`,
    );
  }

  if (!KNOWN_CAPABLE_OLLAMA_MODELS.includes(model)) {
    console.warn(
      `[pet] PET_LLM_MODEL=${model} has not been verified with pet. Structured-output reliability may be lower.`,
    );
  }

  return new ChatOllama({ model, baseUrl });
}
