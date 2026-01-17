import js from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", "main.js", "**/*.js", "**/*.mjs", "coverage/", "scripts/"],
  },
  
  // 1. JS 基础
  js.configs.recommended,
  
  // 2. TS 推荐配置
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  
  // 3. Obsidian 推荐配置
  ...obsidianmd.configs.recommended,
  
  // 4. 项目特定配置和覆盖
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021
      },
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      // TypeScript 规则覆盖
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      
      // Obsidian 规则覆盖
      "obsidianmd/sample-names": "off",
    },
  }
);
