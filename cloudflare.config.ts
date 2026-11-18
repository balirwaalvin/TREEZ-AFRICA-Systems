import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

// `npm run dev:mail-test` sends receipts to a local mail catcher (scripts/mail-catcher.mjs)
// instead of Titan, so the whole send can be tried without emailing anyone.
export default defineConfig(({ mode }) => {
  const mailTest = mode === "mail-test";
  return {
    worker: {
      name: "treez-africa-systems",
      entrypoint,
      compatibilityDate: "2026-11-01",
      domains: ["treez.tech"],
      workersDev: false,
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
        // Receipts are emailed through this Titan mailbox, which also gets a copy of each one.
        SMTP_HOST: bindings.text(mailTest ? "127.0.0.1" : "smtp.titan.email"),
        SMTP_PORT: bindings.text(mailTest ? "2525" : "465"),
        SMTP_USER: bindings.text("receipts@treez.tech"),
        // The mailbox password lives only in Cloudflare. Plain `npm run dev` has none, so it never reaches Titan.
        SMTP_PASSWORD: mailTest ? bindings.text("mail-test") : bindings.secret(),
        // Mailboxes at /mail/ send and receive through Resend. In mail-test mode a local stand-in
        // (scripts/mail-catcher.mjs) plays Resend, so nothing is ever really sent.
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
