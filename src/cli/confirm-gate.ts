import { confirm } from "@inquirer/prompts";

/**
 * A human-in-the-loop confirmation that degrades to a readable message instead
 * of a Node stack trace.
 *
 * `@inquirer/prompts` throws `ExitPromptError` when stdin closes without an
 * answer — which is what happens whenever a gate is reached from a pipe, a CI
 * job, or a script that forgot `--yes`. Unhandled, that surfaces as an
 * `ExitPromptError` dump over the command's own output.
 */
export async function confirmGate(message: string): Promise<boolean> {
  try {
    return await confirm({ message, default: false });
  } catch (error) {
    if (error instanceof Error && error.name === "ExitPromptError") {
      console.error(
        "\nNo answer received — stdin is not interactive. Re-run with --yes to confirm non-interactively.",
      );
      return false;
    }
    throw error;
  }
}
