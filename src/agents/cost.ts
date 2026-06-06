import { confirm } from "@inquirer/prompts";

const ESTIMATED_COST_USD: Record<string, number> = {
  spawn_architect: 0.15,
  spawn_techlead: 0.25,
  spawn_analyst: 0.12,
  spawn_researcher: 0.1,
  spawn_designer: 0.15,
  spawn_designer_enrich: 0.12,
};

export function estimateCommandCostUsd(kind: string): number {
  return ESTIMATED_COST_USD[kind] ?? 0.1;
}

export function estimatePlanCostUsd(commands: { kind: string }[]): number {
  return commands.reduce((sum, c) => sum + estimateCommandCostUsd(c.kind), 0);
}

export async function confirmCostIfNeeded(
  totalUsd: number,
  thresholdUsd: number,
  yesFlag: boolean,
): Promise<boolean> {
  if (yesFlag || totalUsd <= thresholdUsd) {
    return true;
  }
  return confirm({
    message: `Estimated cost $${totalUsd.toFixed(2)} exceeds threshold $${thresholdUsd.toFixed(2)}. Continue?`,
    default: false,
  });
}
