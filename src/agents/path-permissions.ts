import type { FilesystemPermission } from "deepagents";

export type AgentRole =
  | "architect"
  | "techlead"
  | "analyst"
  | "researcher"
  | "solution_designer"
  | "designer"
  | "dev"
  | "qa"
  | "devops"
  | "orchestrator";

const ROLE_MCP_SERVERS: Partial<Record<AgentRole, string[]>> = {
  researcher: ["memory"],
  dev: ["memory"],
  qa: [],
  devops: [],
  architect: [],
  techlead: [],
  analyst: [],
  solution_designer: [],
  designer: [],
  orchestrator: [],
};

export function mcpServersForRole(role: AgentRole): string[] {
  return ROLE_MCP_SERVERS[role] ?? [];
}

export function permissionsForRole(role: AgentRole): FilesystemPermission[] {
  switch (role) {
    case "analyst":
      return [
        {
          operations: ["read"],
          paths: ["/product/01-metrics/**", "/product/00-problem-hypotheses/**"],
        },
        { operations: ["write"], paths: ["/product/00-problem-hypotheses/**"] },
        { operations: ["write"], paths: ["/**"], mode: "deny" },
      ];
    case "researcher":
      return [
        { operations: ["read"], paths: ["/adr/**", "/product/**"] },
        { operations: ["write"], paths: ["/product/00-problem-hypotheses/**"] },
        { operations: ["write"], paths: ["/**"], mode: "deny" },
      ];
    case "solution_designer":
      return [
        { operations: ["read"], paths: ["/adr/**", "/product/**"] },
        {
          operations: ["write"],
          paths: ["/product/01-metrics/**", "/product/02-solution-hypotheses/**"],
        },
        { operations: ["write"], paths: ["/**"], mode: "deny" },
      ];
    case "designer":
      return [
        { operations: ["read"], paths: ["/adr/**", "/product/**"] },
        { operations: ["write"], paths: ["/product/03-features/**"] },
        { operations: ["write"], paths: ["/**"], mode: "deny" },
      ];
    case "architect":
      return [
        { operations: ["read"], paths: ["/adr/**", "/product/**"] },
        { operations: ["write"], paths: ["/adr/**", "/product/03-features/**"] },
        { operations: ["write"], paths: ["/**"], mode: "deny" },
      ];
    case "techlead":
      return [
        { operations: ["read"], paths: ["/adr/**", "/product/**"] },
        { operations: ["write"], paths: ["/product/04-tasks/**"] },
        { operations: ["write"], paths: ["/**"], mode: "deny" },
      ];
    case "dev":
      return [
        { operations: ["read"], paths: ["/adr/**", "/product/**"] },
        { operations: ["write"], paths: ["/product/04-tasks/**"] },
        { operations: ["write"], paths: ["/**"], mode: "deny" },
      ];
    case "qa":
      return [
        { operations: ["read"], paths: ["/adr/**", "/product/**"] },
        { operations: ["write"], paths: ["/product/05-qa-plans/**"] },
        { operations: ["write"], paths: ["/**"], mode: "deny" },
      ];
    case "devops":
      return [
        { operations: ["read"], paths: ["/adr/**", "/product/**"] },
        { operations: ["write"], paths: ["/product/06-releases/**"] },
        { operations: ["write"], paths: ["/**"], mode: "deny" },
      ];
    case "orchestrator":
      return [
        { operations: ["read"], paths: ["/adr/**", "/product/**"] },
        { operations: ["write"], paths: ["/product/orchestration/**"] },
        { operations: ["write"], paths: ["/**"], mode: "deny" },
      ];
  }
}
