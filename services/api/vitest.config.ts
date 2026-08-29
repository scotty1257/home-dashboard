import { defineConfig } from "vitest/config";

/**
 * node:sqlite (Node 22.5+) is absent from Vite 5's builtin-modules list, so the
 * SSR transform tries to resolve "sqlite" as a file. A resolveId hook marks it
 * external before Vite's internal resolution runs.
 */
const nodeSqliteExternal = {
  name: "node-sqlite-external",
  resolveId(id: string) {
    if (id === "node:sqlite" || id === "sqlite") {
      return { id: "node:sqlite", external: true };
    }
    return null;
  },
};

export default defineConfig({
  plugins: [nodeSqliteExternal],
  test: {
    environment: "node",
  },
});
