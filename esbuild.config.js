import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

await esbuild.build({
  entryPoints: ["src/cli/main.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  jsx: "automatic",
  outfile: "dist/pet.js",
  alias: {
    "@": "./src",
  },
  packages: "external",
});

mkdirSync("dist/prompts", { recursive: true });
cpSync("src/prompts", "dist/prompts", { recursive: true });
