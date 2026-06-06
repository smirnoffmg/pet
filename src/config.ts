import path from "node:path";
import os from "node:os";

export type PdtConfig = {
  costConfirmThresholdUsd: number;
  mockAgents: boolean;
  verbose: boolean;
};

export function loadConfig(): PdtConfig {
  return {
    costConfirmThresholdUsd: Number.parseFloat(process.env["PET_COST_CONFIRM_THRESHOLD"] ?? "0.5"),
    mockAgents: process.env["PET_MOCK_AGENTS"] === "1",
    verbose: process.env["PET_VERBOSE"] === "1",
  };
}

export function petDataDir(repoHash: string): string {
  return path.join(os.homedir(), ".local", "share", "pet", repoHash);
}

export function sessionDir(repoHash: string, invocationId: string): string {
  return path.join(petDataDir(repoHash), "sessions", invocationId);
}
