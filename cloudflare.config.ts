import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

// `npm run dev:mail-test` sends mailbox email and receipts to a local stand-in for Resend
// (scripts/mail-catcher.mjs), so the whole flow can be tried without emailing anyone.
export default defineConfig(({ mode }) => {
  const mailTest = mode === "mail-test";
  return {
    worker: {
      name: "treez-africa-systems",
      entrypoint,
      compatibilityDate: "2026-11-01",
      // The site, and the mailboxes on their own subdomain.
      domains: ["treez.tech", "mail.treez.tech"],
      workersDev: false,
      previewUrls: false,
      assets: {
        htmlHandling: "auto-trailing-slash",
        notFoundHandling: "404-page",
        // Pages and the API run code, so mail.treez.tech can show only the mailbox (on treez.tech
        // the Worker just hands pages to the static files). Styles, scripts, images and fonts are
        // served straight from the edge on both hostnames, without running the Worker.
        runWorkerFirst: ["/*", "!/css/*", "!/js/*", "!/assets/*", "!/favicon.png"],
      },
      env: {
        ASSETS: bindings.assets(),
        DB: bindings.d1({ id: "0603466d-5476-40f9-969e-7c6c84eb82c3", name: "treez-db" }),
        TURNSTILE_SECRET: bindings.secret(),
        // Per-IP cap on page view writes, enforced without touching the database.
        VIEWS_LIMIT: bindings.rateLimit({ namespace: "1001", simple: { limit: 30, period: 60 } }),
        // Mailboxes at mail.treez.tech and receipts (from receipts@) send and receive through Resend.
        // In mail-test mode a local stand-in (scripts/mail-catcher.mjs) plays Resend, so nothing
        // is ever really sent. Plain `npm run dev` has no API key, so it can't send either.
        MAIL_DOMAIN: bindings.text("treez.tech"),
        RESEND_API_URL: bindings.text(mailTest ? "http://127.0.0.1:2526" : "https://api.resend.com"),
        RESEND_API_KEY: mailTest ? bindings.text("re_mail_test") : bindings.secret(),
        // Signs Resend's webhooks. The mail-test value is the stand-in's, and is public on purpose.
        RESEND_WEBHOOK_SECRET: mailTest ? bindings.text("whsec_bWFpbC10ZXN0LXdlYmhvb2stc2VjcmV0") : bindings.secret(),
        // Email HTML bodies and attachments.
        MAIL_FILES: bindings.r2({ name: "treez-mail" }),
      },
      observability: { enabled: true },
    },
  };
});
