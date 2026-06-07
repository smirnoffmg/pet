import React from "react";
import { render } from "ink";
import { AgentPanel } from "./agent-panel.js";
import type { ToolCallEvent } from "@/agents/run-agent.js";

interface AgentPanelCallbacks {
  onAgentStart: (role: string) => void;
  onToolCall: (e: ToolCallEvent) => void;
}

export async function renderAgentPanel(opts: {
  heading: string;
  runFn: (callbacks: AgentPanelCallbacks) => Promise<number>;
}): Promise<number> {
  return new Promise<number>((resolve) => {
    const { unmount } = render(
      React.createElement(AgentPanel, {
        heading: opts.heading,
        runFn: opts.runFn,
        onExit: (code: number) => {
          unmount();
          resolve(code);
        },
      }),
      { patchConsole: true },
    );
  });
}
