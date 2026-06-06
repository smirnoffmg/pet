import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@langchain/anthropic",
            "@langchain/openai",
            "@langchain/aws",
            "@langchain/community",
            "@langchain/google-vertexai",
            "@langchain/ollama",
          ],
        },
      ],
    },
  },
  {
    files: ["src/llm/provider-factory.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "esbuild.config.js",
      "prettier.config.js",
      "eslint.config.js",
      "vitest.config.ts",
      "scripts/postinstall.js",
    ],
  },
);
