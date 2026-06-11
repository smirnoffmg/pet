import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock before importing the module under test so the factory receives mocked constructors.
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(function (opts: unknown) {
    return { _opts: opts };
  }),
  AzureChatOpenAI: vi.fn().mockImplementation(function (opts: unknown) {
    return { _opts: opts };
  }),
}));

import { ChatOpenAI } from "@langchain/openai";
import { createModel, _setModelForTesting } from "@/llm/provider-factory.js";

const MANAGED_ENV_VARS = [
  "PET_LLM_PROVIDER",
  "PET_LLM_MODEL",
  "PET_LLM_BASE_URL",
  "OPENAI_API_KEY",
];
type EnvSnapshot = Record<string, string | undefined>;
let savedEnv: EnvSnapshot = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of MANAGED_ENV_VARS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  _setModelForTesting(null);
  vi.mocked(ChatOpenAI).mockClear();
});

afterEach(() => {
  for (const key of MANAGED_ENV_VARS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  _setModelForTesting(null);
});

describe("createModel — openai gateway (PET_LLM_BASE_URL)", () => {
  it("passes configuration.baseURL to ChatOpenAI when PET_LLM_BASE_URL is set", async () => {
    process.env["PET_LLM_PROVIDER"] = "openai";
    process.env["OPENAI_API_KEY"] = "sk-test";
    process.env["PET_LLM_BASE_URL"] = "http://my-gateway/v1";

    await createModel();

    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ configuration: { baseURL: "http://my-gateway/v1" } }),
    );
  });

  it("does not set configuration when PET_LLM_BASE_URL is absent", async () => {
    process.env["PET_LLM_PROVIDER"] = "openai";
    process.env["OPENAI_API_KEY"] = "sk-test";

    await createModel();

    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.not.objectContaining({ configuration: expect.anything() }),
    );
  });
});
