import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@langchain/ollama", () => ({
  ChatOllama: vi.fn().mockImplementation((opts: unknown) => ({ _opts: opts })),
}));

import { ChatOllama } from "@langchain/ollama";
import { createModel, _setModelForTesting } from "@/llm/provider-factory.js";

const MANAGED_ENV_VARS = [
  "PET_LLM_PROVIDER",
  "PET_LLM_MODEL",
  "PET_LLM_BASE_URL",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "GOOGLE_APPLICATION_CREDENTIALS",
];

type EnvSnapshot = Record<string, string | undefined>;
let savedEnv: EnvSnapshot = {};
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  savedEnv = {};
  for (const key of MANAGED_ENV_VARS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  _setModelForTesting(null);
  vi.mocked(ChatOllama).mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200 } as unknown as Response),
  );
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
  vi.unstubAllGlobals();
  warnSpy.mockRestore();
});

describe("createModel — ollama provider (TASK-0036)", () => {
  it("(case 1) constructs ChatOllama with default baseUrl when PET_LLM_BASE_URL is unset", async () => {
    process.env["PET_LLM_PROVIDER"] = "ollama";
    process.env["PET_LLM_MODEL"] = "llama3.2";

    await createModel();

    expect(ChatOllama).toHaveBeenCalledWith({
      model: "llama3.2",
      baseUrl: "http://localhost:11434",
    });
  });

  it("(case 2) forwards PET_LLM_BASE_URL as baseUrl to ChatOllama", async () => {
    process.env["PET_LLM_PROVIDER"] = "ollama";
    process.env["PET_LLM_MODEL"] = "llama3.2";
    process.env["PET_LLM_BASE_URL"] = "http://gpu-box:11434";

    await createModel();

    expect(ChatOllama).toHaveBeenCalledWith({
      model: "llama3.2",
      baseUrl: "http://gpu-box:11434",
    });
  });

  it("(case 2b) hits the configured baseUrl during the connectivity check", async () => {
    process.env["PET_LLM_PROVIDER"] = "ollama";
    process.env["PET_LLM_MODEL"] = "llama3.2";
    process.env["PET_LLM_BASE_URL"] = "http://gpu-box:11434";

    await createModel();

    expect(globalThis.fetch).toHaveBeenCalledWith("http://gpu-box:11434/api/tags");
  });

  it("(case 5) throws a descriptive error when the connectivity check rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));
    process.env["PET_LLM_PROVIDER"] = "ollama";
    process.env["PET_LLM_MODEL"] = "llama3.2";

    await expect(createModel()).rejects.toThrow(/Ollama server unreachable/);
    await expect(createModel()).rejects.toThrow(/http:\/\/localhost:11434/);
    await expect(createModel()).rejects.toThrow(/ollama serve/);
  });

  it("(case 5b) throws when the connectivity check returns a non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 } as unknown as Response),
    );
    process.env["PET_LLM_PROVIDER"] = "ollama";
    process.env["PET_LLM_MODEL"] = "llama3.2";

    await expect(createModel()).rejects.toThrow(/Ollama server unreachable/);
  });

  it("(case 6) emits console.warn for an unverified model", async () => {
    process.env["PET_LLM_PROVIDER"] = "ollama";
    process.env["PET_LLM_MODEL"] = "llama3.2";

    await createModel();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/has not been verified with pet/));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("llama3.2"));
  });

  it("(case 6b) does NOT warn for a known-capable model", async () => {
    process.env["PET_LLM_PROVIDER"] = "ollama";
    process.env["PET_LLM_MODEL"] = "llama3.3";

    await createModel();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("(case 7) resolves without any provider API-key env vars set", async () => {
    // Sanity: every cloud-provider credential is cleared in beforeEach.
    expect(process.env["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(process.env["OPENAI_API_KEY"]).toBeUndefined();
    expect(process.env["AZURE_OPENAI_API_KEY"]).toBeUndefined();
    expect(process.env["GOOGLE_APPLICATION_CREDENTIALS"]).toBeUndefined();

    process.env["PET_LLM_PROVIDER"] = "ollama";
    process.env["PET_LLM_MODEL"] = "llama3.3";

    await expect(createModel()).resolves.toBeDefined();
  });
});
