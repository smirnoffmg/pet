import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createModel,
  resolveProvider,
  resolveModelId,
  _setModelForTesting,
} from "@/llm/provider-factory.js";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

type EnvSnapshot = Record<string, string | undefined>;

const PROVIDER_ENV_VARS = [
  "PET_LLM_PROVIDER",
  "PET_LLM_MODEL",
  "PET_LLM_BASE_URL",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "GOOGLE_APPLICATION_CREDENTIALS",
];

let savedEnv: EnvSnapshot = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of PROVIDER_ENV_VARS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  _setModelForTesting(null);
});

afterEach(() => {
  for (const key of PROVIDER_ENV_VARS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  _setModelForTesting(null);
});

describe("resolveProvider", () => {
  it("defaults to anthropic", () => {
    expect(resolveProvider()).toBe("anthropic");
  });

  it("returns the env var value when set", () => {
    process.env["PET_LLM_PROVIDER"] = "openai";
    expect(resolveProvider()).toBe("openai");
  });
});

describe("resolveModelId", () => {
  it("returns anthropic default when no env vars set", () => {
    expect(resolveModelId()).toBe("claude-sonnet-4-6");
  });

  it("returns PET_LLM_MODEL override when set", () => {
    process.env["PET_LLM_MODEL"] = "claude-opus-4-7";
    expect(resolveModelId()).toBe("claude-opus-4-7");
  });

  it("returns openai default when provider is openai", () => {
    process.env["PET_LLM_PROVIDER"] = "openai";
    expect(resolveModelId()).toBe("gpt-4o");
  });
});

describe("createModel — unknown provider", () => {
  it("throws a descriptive error naming the value and valid options", async () => {
    process.env["PET_LLM_PROVIDER"] = "groq";
    await expect(createModel()).rejects.toThrow(/PET_LLM_PROVIDER="groq" is not supported/);
    await expect(createModel()).rejects.toThrow(
      /anthropic, openai, azure-openai, bedrock, vertex, ollama/,
    );
  });
});

describe("createModel — missing credentials", () => {
  it("throws when ANTHROPIC_API_KEY is absent", async () => {
    process.env["PET_LLM_PROVIDER"] = "anthropic";
    await expect(createModel()).rejects.toThrow(/ANTHROPIC_API_KEY.*PET_LLM_PROVIDER=anthropic/);
  });

  it("throws when OPENAI_API_KEY is absent", async () => {
    process.env["PET_LLM_PROVIDER"] = "openai";
    await expect(createModel()).rejects.toThrow(/OPENAI_API_KEY.*PET_LLM_PROVIDER=openai/);
  });

  it("throws when AZURE_OPENAI_API_KEY is absent", async () => {
    process.env["PET_LLM_PROVIDER"] = "azure-openai";
    await expect(createModel()).rejects.toThrow(
      /AZURE_OPENAI_API_KEY.*PET_LLM_PROVIDER=azure-openai/,
    );
  });

  it("throws when AZURE_OPENAI_ENDPOINT is absent but key is present", async () => {
    process.env["PET_LLM_PROVIDER"] = "azure-openai";
    process.env["AZURE_OPENAI_API_KEY"] = "test-key";
    await expect(createModel()).rejects.toThrow(
      /AZURE_OPENAI_ENDPOINT.*PET_LLM_PROVIDER=azure-openai/,
    );
  });

  it("throws when GOOGLE_APPLICATION_CREDENTIALS is absent", async () => {
    process.env["PET_LLM_PROVIDER"] = "vertex";
    await expect(createModel()).rejects.toThrow(
      /GOOGLE_APPLICATION_CREDENTIALS.*PET_LLM_PROVIDER=vertex/,
    );
  });

  it("throws when PET_LLM_MODEL is absent for ollama", async () => {
    process.env["PET_LLM_PROVIDER"] = "ollama";
    await expect(createModel()).rejects.toThrow(
      /PET_LLM_MODEL is required when PET_LLM_PROVIDER=ollama/,
    );
  });
});

describe("createModel — test seam", () => {
  it("returns the injected stub without requiring any env vars", async () => {
    const stub = { invoke: () => Promise.resolve({}) } as unknown as BaseChatModel;
    _setModelForTesting(stub);
    const result = await createModel();
    expect(result).toBe(stub);
  });

  it("returns null after _setModelForTesting(null)", async () => {
    const stub = { invoke: () => Promise.resolve({}) } as unknown as BaseChatModel;
    _setModelForTesting(stub);
    _setModelForTesting(null);
    // Should now try to build the real model; without credentials it will throw
    process.env["PET_LLM_PROVIDER"] = "anthropic";
    await expect(createModel()).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
