import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "public",
      "*.config.ts",
      "*.config.js",
      "eslint.config.js",
    ],
  },
  {
    files: ["src/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    languageOptions: {
      globals: {
        ...globals.browser,
        Office: "readonly",
        PowerPoint: "readonly",
        OfficeExtension: "readonly",
      },
    },
  },
  {
    files: ["server/**/*.mjs", "scripts/**/*.mjs"],
    extends: [js.configs.recommended, prettier],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node, fetch: "readonly", Blob: "readonly", URL: "readonly" },
    },
  },
);
