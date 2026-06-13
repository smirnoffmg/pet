import path from "node:path";
import React from "react";
import { render } from "ink";
import { docRoot, findRepoRoot, readGitBranch } from "@/store/repo-root.js";
import { TreeUI } from "./tree-ui.js";

export async function runTree(): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);
  const repoName = path.basename(repoRoot);
  const branch = readGitBranch(repoRoot);

  return new Promise<number>((resolve) => {
    const { unmount } = render(
      React.createElement(TreeUI, {
        docRoot: root,
        repoRoot,
        repoName,
        branch,
        onExit: (code: number) => {
          unmount();
          resolve(code);
        },
      }),
      { patchConsole: true, alternateScreen: true },
    );
  });
}
