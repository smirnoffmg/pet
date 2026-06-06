import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn().mockImplementation((opts: unknown) => ({ _opts: opts })),
}));

import { ChatAnthropic } from "@langchain/anthropic";
import { createModel, _setModelForTesting } from "@/llm/provider-factory.js";

const MANAGED_ENV_VARS = [
  "PET_LLM_PROVIDER",
  "PET_LLM_MODEL",
  "PET_LLM_BASE_URL",
  "ANTHROPIC_API_KEY",
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
  vi.mocked(ChatAnthropic).mockClear();
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

describe("createModel — anthropic gateway (PET_LLM_BASE_URL)", () => {
  it("passes anthropicApiUrl to ChatAnthropic when PET_LLM_BASE_URL is set", async () => {
    process.env["PET_LLM_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    process.env["PET_LLM_BASE_URL"] = "http://my-gateway/v1";

    await createModel();

    expect(ChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ anthropicApiUrl: "http://my-gateway/v1" }),
    );
  });

  it("does not set anthropicApiUrl when PET_LLM_BASE_URL is absent", async () => {
    process.env["PET_LLM_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";

    await createModel();

    expect(ChatAnthropic).toHaveBeenCalledWith(
      expect.not.objectContaining({ anthropicApiUrl: expect.anything() }),
    );
  });
});
