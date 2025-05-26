import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// 在CI环境中禁用ESLint
const isCI = process.env.CI === "true" || process.env.NODE_ENV === "production";

const eslintConfig = isCI
  ? [
      {
        ignores: ["**/*"],
      },
    ]
  : [...compat.extends("next/core-web-vitals", "next/typescript")];

export default eslintConfig;
