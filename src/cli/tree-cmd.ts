import React from "react";
import { render } from "ink";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import { TreeUI } from "./tree-ui.js";

export async function runTree(): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  return new Promise<number>((resolve) => {
    const { unmount } = render(
      React.createElement(TreeUI, {
        docRoot: root,
        onExit: (code: number) => {
          unmount();
          resolve(code);
        },
      }),
      { patchConsole: true },
    );
  });
}
