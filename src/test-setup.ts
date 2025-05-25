import "@testing-library/jest-dom";

// Mock 环境变量
if (!process.env.NODE_ENV) {
  Object.defineProperty(process.env, "NODE_ENV", { value: "test" });
}

// 设置测试超时时间
global.setTimeout = setTimeout;

// Mock fetch for node environment
if (!global.fetch) {
  global.fetch = require("node-fetch");
}

// 禁用控制台警告（测试期间）
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  if (args[0]?.includes?.("validateDOMNesting")) return;
  originalWarn(...args);
};
