import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python environment of the Docling parser (bundles third-party JS).
    "parser/.venv/**",
    // Copied from pdfjs-dist on install (minified vendor code).
    "public/pdf.worker.min.mjs",
  ]),
]);

export default eslintConfig;
