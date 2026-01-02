import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

// 使用正确的规则名称
export default [
  {
    // 定义要忽略的文件
    ignores: ["dist/**/*", "build/**/*", "node_modules/**/*", "main.js"],
  },
  {
    plugins: {
      obsidianmd
    },
    rules: {
      // 使用核心规则
      "obsidianmd/prefer-file-manager-trash-file": "error",
      "obsidianmd/no-plugin-as-component": "warn",
      "obsidianmd/detach-leaves": "warn",
      "obsidianmd/sample-names": "off",  // 关闭示例规则
      "obsidianmd/no-sample-code": "warn",
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/validate-manifest": "warn",
      "obsidianmd/validate-license": "warn",
      "obsidianmd/regex-lookbehind": "warn",
      "obsidianmd/no-forbidden-elements": "off", 
      "obsidianmd/no-view-references-in-plugin": "error",
      "obsidianmd/hardcoded-config-path": "error",
      "obsidianmd/platform": "warn",
      "obsidianmd/prefer-abstract-input-suggest": "warn",
      "obsidianmd/object-assign": "warn",
    }
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { 
        project: "./tsconfig.json",
      },
    },
    
    // 针对项目特定的规则配置
    rules: {
      // 可以根据需要添加更多 TypeScript 相关规则
    },
  },
];