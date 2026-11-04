import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "treez-africa-systems",
    entrypoint,
    compatibilityDate: "2026-11-01",
    domains: ["treez.tech"],
    workersDev: true,
    previewUrls: false,
    assets: {
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "404-page",
      // Only the API runs code; every page and file is served straight from the edge.
      runWorkerFirst: ["/api/*"],
    },
    env: {
      DB: bindings.d1({ id: "0603466d-5476-40f9-969e-7c6c84eb82c3", name: "treez-db" }),
      TURNSTILE_SECRET: bindings.secret(),
      // Per-IP cap on page view writes, enforced without touching the database.
      VIEWS_LIMIT: bindings.rateLimit({ namespace: "1001", simple: { limit: 30, period: 60 } }),
    },
    observability: { enabled: true },
  },
});
