import { defineConfig, globalIgnores } from "eslint/config";

/**
 * Minimal flat config so `pnpm lint` runs repo-wide.
 *
 * The repo has no typescript-eslint packages installed, so this config does
 * not attempt to parse TS/TSX sources (tsc handles those via `pnpm
 * typecheck`); `eslint .` therefore lints the plain-JS files (this config,
 * scripts) while the ignores keep dependency/build/runtime state out.
 */
export default defineConfig([
  globalIgnores([
    "node_modules/",
    "**/dist/",
    "**/build/",
    "var/",
    "data/",
    "services/voice/.venv/",
    "services/voice/.pytest_cache/",
    "coverage/",
    "test-results/",
    "**/test-results/",
    "playwright-report/",
    ".kiosk/",
    ".hermes/",
  ]),
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "no-var": "warn",
      eqeqeq: ["warn", "smart"],
      "prefer-const": "warn",
    },
  },
]);
