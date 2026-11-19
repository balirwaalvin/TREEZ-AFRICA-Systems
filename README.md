<div align="center">

# 🌳 TREEZ AFRICA SYSTEMS

### *Building the Digital Future of Africa*

<br>

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Status](https://img.shields.io/badge/Status-Live-00A651?style=for-the-badge)
![License](https://img.shields.io/badge/License-Proprietary-0052CC?style=for-the-badge)

<br>

<img src="https://readme-typing-svg.demolab.com?font=Poppins&weight=700&size=22&duration=3000&pause=1000&color=00A651&center=true&vCenter=true&multiline=true&repeat=true&width=600&height=80&lines=Web+Apps+%7C+Mobile+Apps+%7C+Enterprise+Banking;Powering+Africa's+Digital+Transformation" alt="Typing SVG" />

<br>

---

*A subsidiary of **TREEZ AFRICA HOLDINGS***

---

</div>

<br>

## 🚀 About The Project

**TREEZ AFRICA SYSTEMS** is the technology arm of **TREEZ AFRICA HOLDINGS**, dedicated to developing, maintaining, and planning world-class software solutions across Africa. From web and mobile applications to enterprise banking systems, we empower businesses to thrive in the digital age.

This repository contains the official company website — a modern, animated, multi-page static site that showcases our services, portfolio, team, and allows clients to book consultations directly.

<br>

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎨 Design & UX
- "Systems engineering" visual language — graphite surfaces, hairline borders, monospace data/labels, amber + status-green accents
- No stock/AI illustration — hero, architecture, and service visuals are coded components (terminal-style panels, ledgers, diagrams)
- Smooth scroll-reveal animations on every page
- Command palette (`Ctrl/Cmd K`) for fast site-wide navigation
- Custom scrollbar & page preloader

</td>
<td width="50%">

### ⚙️ Functionality
- **Multi-step booking form** with validation, review, and spam-protected submission
- **Partner showcase** — logo wall, story cards, landmark-project bento grid
- **Testimonial carousel** with swipe/touch support
- **FAQ accordion** with smooth transitions
- **Contact form** with real-time validation
- **Newsletter subscription** form
- **Mobile-first** hamburger navigation with animations

</td>
</tr>
</table>

<br>

## 📄 Pages

| Page | Description |
|:-----|:------------|
| 🏠 **Home** | Editorial hero with a live Africa network map and "systems ledger", architecture-diagram about panel, service cards, tech-stack band, engineering pipeline, case studies, testimonials |
| 📖 **About** | Company changelog (history as version entries), mission/vision/values manifesto, team roster |
| 🛠️ **Services** | 5 service sections each with a bespoke coded panel (Lighthouse scores, release channels, transaction ledger, uptime, roadmap), technology stack manifest, process pipeline |
| 🤝 **Partners** | Partner logo wall, partner story cards, landmark-project bento grid, partner testimonials, stats |
| 📅 **Booking** | 4-step consultation form: Contact → Services → Project Details → Review & Submit |
| 📝 **Blog** | Editorial article index (date-tile rows), categories, reading times |
| 📰 **Blog Post** | Full article template with share buttons and related posts |
| 📞 **Contact** | Contact form, info ledger, Google Maps embed, 7-item FAQ accordion |
| 🚫 **404** | Custom not-found page with the requested path and quick links back |

<br>

## 🗂️ Project Structure

Every page lives at a clean URL (`/about/` rather than `/about.html`) via the
folder + `index.html` convention — the standard directory-index behavior
every static host supports natively, no rewrite rules required. The old
flat `*.html` paths still exist as tiny client-side redirect stubs (meta
refresh + JS) that bounce to the clean URL, so old bookmarks/links never 404.

```
TREEZ-AFRICA-Systems/
│
├── cloudflare.config.ts    # Worker, domain, database and asset settings
├── src/                    # The API: runs on Cloudflare Workers
│   ├── index.ts            # Routes for forms, blog, analytics and the admin workspace
│   ├── auth.ts             # Admin passwords, sessions and sign-in limits
│   ├── http.ts             # JSON, validation and rate limiting helpers
│   ├── receipts.ts         # Invoices, receipts and the receipt email (sent through Resend)
│   └── mail/               # Mailboxes at mail.treez.tech: sign-in, messages, Resend client and webhook
├── migrations/             # D1 (database) schema
├── scripts/                # create-admin.mjs, create-mailbox.mjs, backup.mjs, backup-schedule.sh, mail-catcher.mjs, push-keys.mjs
├── tests/                  # End-to-end API tests
│
└── public/                 # Everything visitors can load. Nothing outside it is served.
    ├── index.html              # Homepage — served at /
    ├── about/index.html        # About Us — served at /about/
    ├── services/index.html     # Our Services — served at /services/
    ├── projects/index.html     # Our Projects — served at /projects/
    ├── portfolio/index.html    # Partners — served at /portfolio/
    ├── booking/index.html      # Book a Consultation — served at /booking/
    ├── blog/index.html         # Blog & Insights — served at /blog/
    ├── blog-post/index.html    # Blog Article Template — served at /blog-post/?id=…
    ├── contact/index.html      # Contact Us + FAQ — served at /contact/
    ├── admin/index.html        # Private admin workspace — served at /admin/
    ├── mail/index.html         # treez.tech mailboxes — served at the root of mail.treez.tech
    ├── about.html, services.html, …   # Redirect stubs -> their /slug/ equivalent
    ├── 404.html                # Custom not-found page (stays at root)
    ├── favicon.png             # Brand favicon (amber circuit-tree mark)
    ├── _headers                # Security headers for static files
    ├── robots.txt
    ├── sitemap.xml
    │
    ├── css/
    │   ├── global.css          # Reset, tokens, typography, buttons, command palette
    │   ├── animations.css      # Scroll-reveal, marquee, page transitions & reduced-motion rules
    │   ├── header.css          # Sticky navbar & mobile menu
    │   ├── footer.css          # Footer layout & newsletter
    │   ├── home.css            # Homepage-specific styles
    │   ├── about.css           # Shared inner-page chrome (page-hero, CTA banner, 404) + About sections
    │   ├── services.css        # Service panels, stack manifest, process pipeline
    │   ├── portfolio.css       # Partner wall, showcase cards, bento grid
    │   ├── booking.css         # Multi-step form & sidebar
    │   ├── blog.css            # Blog index & article typography
    │   └── contact.css         # Contact form, ledger & FAQ
    │
    ├── js/
    │   ├── api.js               # Client for the site's API and the spam check
    │   ├── main.js              # Navbar, preloader, smooth scroll
    │   ├── animations.js        # IntersectionObserver scroll-reveal & stagger
    │   ├── hero.js              # Homepage network map (dot-matrix Africa) & headline decode
    │   ├── live-panels.js       # Live panels: metrics, transactions, terminals, CI run, partner graph, clock
    │   ├── command-palette.js   # Ctrl/Cmd K site-wide search
    │   ├── testimonials.js      # Auto-play carousel with swipe
    │   ├── booking.js           # Multi-step form logic, validation & submission
    │   ├── contact.js           # Contact form validation, submission & FAQ accordion
    │   ├── blog-public.js       # Blog index — API fetch with static fallback
    │   └── blog-post-public.js  # Blog post — API fetch with static fallback
    │
    └── assets/
        └── images/              # Brand mark only — no stock/AI imagery
```

<br>

## ☁️ Hosting & Backend

The site runs on Cloudflare: static files from `public/`, a small Worker API in `src/`, and a D1 (SQLite) database. Requires Node.js 22.18+ and the `cf` CLI (`npm install -g cf`, then `cf auth login`).

| Task | Command |
|:-----|:--------|
| Install dependencies | `npm install` |
| Run locally | `npm run dev` |
| Run locally, catching receipt and mailbox emails | `npm run mail-catcher` + `npm run dev:mail-test` |
| Create a mailbox, or reset its password | `npm run mail:create -- name@treez.tech "Full Name"` |
| Make the keys for new-mail notifications (once) | `npm run push:keys` |
| Check types | `npm run typecheck` |
| Deploy to treez.tech | `npm run deploy` |
| Apply new database migrations | `npm run db:migrate` |
| Save a backup to `backups/` | `npm run backup` |
| Turn the daily backup on or off | `npm run backup:schedule` / `npm run backup:unschedule` |
| Check the daily backup | `npm run backup:status` |

**Local setup:** copy `.dev.vars.example` to `.dev.vars`, then run `npm run db:migrate:local` and `npm run admin:create -- you@example.com --local`.

**Tests** run against a local production build and refuse any other host. They use up rate limits, so start from a fresh local database (delete `.cloudflare/state`, then repeat the local setup):

```sh
npx cf build && npx vite preview --port 4173
BASE_URL=http://localhost:4173 ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npm test
```

The mailbox tests (`tests/mail.test.mjs`) also cover sending and receiving when the build is in mail-test mode, with the Resend stand-in running:

```sh
npx cf build --mode mail-test && npx vite preview --port 4173
SITE_URL=http://localhost:4173 npm run mail-catcher
MAIL_TEST=1 BASE_URL=http://localhost:4173 ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node --test tests/mail.test.mjs
```

**Spam protection:** public forms use [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) plus a limit of 5 messages per IP every 10 minutes. The Worker's `TURNSTILE_SECRET` is stored in Cloudflare, never in this repo.

**Backups:** D1 Time Travel keeps restore points automatically for a limited window. `npm run backup:schedule` also saves a separate copy to `backups/daily/` once a day on this Linux computer, using a systemd user timer. It runs at midnight, or the next time you sign in if the computer was off, and keeps the newest 30. If a backup fails it retries, then shows a desktop notification; see the reason with `journalctl --user -u treez-backup`, and run `cf auth login` if the sign-in expired. If the project folder moves, run `npm run backup:schedule` again. `npm run backup` saves a one-off copy to `backups/` that is never deleted automatically. Backup files contain customer details and are ignored by git.

## 🔐 Admin Workspace

The private admin workspace is at `/admin/` and is intentionally linked only by a low-contrast key icon in the footer. There is no public sign-up: admins are created from the command line, and the password is typed at a hidden prompt.

```sh
npm run admin:create -- you@example.com
```

Running the same command for an existing admin resets their password and signs them out everywhere. Passwords need at least 12 characters. Sign-in attempts are limited to 10 per IP and 30 per email every 15 minutes, and sessions last 7 days.

Conversation status and notes are shared by all admins. Read/unread is remembered per browser.

### Receipts

The **Receipts** tab issues eReceipts in the TAH template and emails them to clients from `receipts@treez.tech`.

- **Each receipt is one payment against an invoice.** For a first payment, choose *New invoice*. For a later payment, open the last receipt and choose **Record next payment**, or pick the invoice from the list. The invoice details, items and balance are filled in for you, and each receipt's payment history lists every payment up to it.
- **Preview before sending.** The PDF on the right is redrawn as you type, and it is exactly what gets attached. **Send to client** asks for confirmation, then emails the client and files a copy, PDF included, in `receipts@treez.tech`'s Sent folder at `mail.treez.tech`. **Save without sending** keeps it to send later.
- **Safeguards.** A payment can't be more than the balance, or dated before the invoice's last payment. Receipt and invoice numbers must be unique. Sent receipts can't be deleted.
- **Numbers** are suggested in the house formats (`TAH-YYYYMMDD-NNN` for invoices, `TAH 8989 NNNN` for receipts), and both can be edited.

Receipts are sent through Resend, like the rest of the site's mail (see [Mail](#-mail-mailtreeztech) below), using the same `RESEND_API_KEY`. Until it is set, receipts still save, and sending reports that email isn't set up yet. Clients who reply to a receipt reach the `receipts@treez.tech` mailbox.

To try the whole flow without emailing anyone, run the Resend stand-in and the site in mail-test mode in two terminals. Every email, receipts included, is saved to `mail-catcher/` as a `-sent.json` file:

```sh
npm run mail-catcher
npm run dev:mail-test
```

Plain `npm run dev` has no Resend API key, so it can never send real email.

## 📬 Mail (`mail.treez.tech`)

[`mail.treez.tech`](https://mail.treez.tech/) is a webmail client for `@treez.tech` addresses. Each address is a **mailbox** with its own password, separate from admin accounts: a mailbox password never opens the admin workspace, and an admin can't read anyone's mail. Mail is sent and received through [Resend](https://resend.com).

**Where it lives:** `mail.treez.tech` is a second custom domain on the same Worker (see `domains` in `cloudflare.config.ts`). The subdomain shows only the mailbox: `public/mail/index.html` at its root, the mail API (`/api/mail/*`), and the styles, scripts and images it loads. Any other page there redirects to the same page on `treez.tech`, other APIs answer 404, and old links to `treez.tech/mail/` redirect to the subdomain. To do this the Worker runs first for every path except `/css/`, `/js/`, `/assets/` and the favicon; on `treez.tech` it just hands pages to the static files. Locally, open `http://mail.localhost:5173/` to see the subdomain, or keep using `localhost:5173/mail/`.

**What people can do:** read mail in Inbox, Starred, Sent, Drafts, Archive, Junk and Bin; write, reply, reply all and forward, with attachments up to 15 MB each (25 MB per email); search everything; star, archive, mark read or unread, and select several emails at once; change their name, signature and password under Settings. Drafts save as you type. Keyboard shortcuts are listed under <kbd>?</kbd>.

**Issuing mailboxes:** in the admin workspace, open **Mailboxes** → **New mailbox**, or use the command line (the password is typed at a hidden prompt):

```sh
npm run mail:create -- jane@treez.tech "Jane Doe"
```

From the Mailboxes tab an admin can rename a mailbox, set a new password, switch it off (signs it out and stops filing its mail, keeping everything) or, once switched off, delete it with all its mail. People can also sign in with just the part before the `@`.

**Extra addresses:** a mailbox can also receive mail for other addresses, under **Mailboxes** → **Extra addresses**. Today `care@`, `helpdesk@` and `support@` land in `balirwa@treez.tech`'s inbox. Those emails carry a small tag (`care@`) in the list, replies go out from the address the email was sent to, and **From** in Compose lets you pick any of the mailbox's addresses. An extra address can't have its own sign-in, and belongs to one mailbox at a time.

### How mail flows

- **Sending:** the Worker calls Resend's API from the signed-in address. Attachments are uploaded to the `treez-mail` R2 bucket first, and Resend fetches them from a signed link that expires after a day, so large files never pass through the Worker's memory. Replies carry `In-Reply-To` and `References`, so they thread in the recipient's mail app. Each mailbox can send 100 emails a day.
- **Receiving:** Resend calls `POST /api/mail/inbound` (signed with the webhook secret) for each `email.received` event. The Worker fetches the email, stores its HTML, attachments and original `.eml` in R2, and files a copy in every addressed mailbox (To, Cc, Bcc). Mail to an address with no mailbox is dropped. Mail that fails DMARC goes to Junk. Retries never file the same email twice.
- **Delivery status:** subscribe the same webhook to `email.delivered`, `email.bounced`, `email.complained` and `email.delivery_delayed`, and the Sent folder shows whether each email arrived.
- **Reading safely:** email HTML is shown in a sandboxed frame that can't run scripts or reach the page, and pictures from the web stay hidden until you choose **Show pictures**, because they can tell the sender you opened the email. Attachments always download rather than open on the site.

### The app and notifications

`mail.treez.tech` is an installable app (a PWA). In Chrome, Edge and on Android, **Install app** appears in the account menu; on iPhone and iPad, use Share → **Add to Home Screen**. Installed, it opens in its own window with the TREEZ icon, shows the unread count on the icon where the system supports it, and still opens without a connection (mail itself is never stored on the device, so reading needs a connection).

**New-mail notifications** reach the phone's or computer's notification panel even when the app is closed. People turn them on per device from the prompt above the inbox or under **Settings → Notifications**, which also has **Send a test**. On iPhone and iPad they work once TREEZ Mail has been added to the Home Screen (iOS 16.4 or later). Tapping a notification opens that email.

- **How they're sent:** after an email is filed in an inbox (not Junk), the Worker sends a Web Push message to each device that turned notifications on, through that browser's own push service (Google, Mozilla, Apple or Microsoft). Each message is encrypted for that device and signed with the site's key (VAPID), in `src/mail/push.ts`. It holds the sender, the subject and the first line.
- **Which devices:** a device belongs to the sign-in it was turned on from, in `mail_push_subscriptions`. Signing out, a password change on another device, or the mailbox being switched off or deleted ends its notifications. Devices the browser has dropped are forgotten the first time a push to them fails. Each mailbox can have up to 20 devices.
- **Keys:** `npm run push:keys` makes the key pair once and stores it as the Worker secrets `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, keeping a copy in `.env.local`. Until then, Settings says notifications aren't set up. Making new keys later (`npm run push:keys -- --replace`) is safe: each device signs up again by itself the next time the app is opened.
- **Files:** `public/mail/manifest.webmanifest` and `public/mail/sw.js` (the service worker: notifications, opening emails, the offline copy of the app), served at the root of `mail.treez.tech`. Icons are in `public/assets/images/mail/`.
- **Trying it locally:** in mail-test mode the Resend stand-in also plays the push service, and `tests/mail.test.mjs` decrypts each push and checks its signature, as a browser would.

### Setting up Resend

This is done for treez.tech (since November 2026). To set it up again:

1. In Resend, add the domain `treez.tech` and the DNS records it shows: the `resend._domainkey` TXT record (DKIM) and the `send` MX and TXT records (bounces and SPF).
2. Turn on **receiving** and point `treez.tech`'s MX record at Resend (`receive-euw1.forge.rmta.net`). Every `@treez.tech` address then arrives at `mail.treez.tech`. Mail for an address with no mailbox or extra address is dropped, so set those up first. (Mail can also be received on a subdomain such as `in.treez.tech`: any subdomain of `MAIL_DOMAIN` files into the matching `@treez.tech` mailbox.)
3. Create a Resend API key with sending access, and a webhook to `https://treez.tech/api/mail/inbound` for the events above. Store both in the Worker. Each command waits for you to paste the value, and neither shows it nor saves it in your shell history:

   ```sh
   read -rs VALUE && npx cf workers secrets update RESEND_API_KEY --worker treez-africa-systems --type secret_text --text "$VALUE"; unset VALUE
   read -rs VALUE && npx cf workers secrets update RESEND_WEBHOOK_SECRET --worker treez-africa-systems --type secret_text --text "$VALUE"; unset VALUE
   ```

   Deploys fail until both exist.
4. Create the R2 bucket once (`npx cf r2 buckets create --name treez-mail`) and apply the migrations (`npm run db:migrate`).

If an email arrived before its mailbox or extra address existed, replay its `email.received` delivery from the webhook's log in Resend, and it's filed.

To try everything locally without Resend, run `npm run mail-catcher` and `npm run dev:mail-test`. The catcher plays Resend on port 2526: sent mail is saved to `mail-catcher/*-sent.json`, mail to `@treez.tech` comes straight back in as received, and you can pretend someone emailed a mailbox:

```sh
curl -X POST http://127.0.0.1:2526/inject -H 'Content-Type: application/json' \
  -d '{"from":"Jane <jane@example.com>","to":["care@treez.tech"],"subject":"Hello","text":"Hi there"}'
```

<br>

## 🎨 Brand Colors

"Systems engineering" palette — graphite surfaces with a single amber accent and a status-green for live/positive states. No stock gradients.

<div align="center">

| Color | Hex | Usage |
|:------|:----|:------|
| 🟠 **Amber** | `#FFB020` | Primary accent — CTAs, links, highlights, brand mark |
| 🟢 **Status Green** | `#34D399` | Live/operational indicators, success states |
| 🔴 **Status Red** | `#FF6B6B` | Errors, validation |
| ⬛ **Graphite (base)** | `#0A0D11` | Page background |
| ⬛ **Graphite (raised)** | `#10151C` / `#161D26` | Section bands, card surfaces |
| ⚪ **Text** | `#EDF1F5` / `#9AA5B3` / `#616B78` | Primary / secondary / tertiary text |

</div>

<br>

## 🛠️ Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Markup** | Semantic HTML5 |
| **Styling** | Vanilla CSS3 (Custom Properties, Grid, Flexbox, `@keyframes`) |
| **Interactivity** | Vanilla ES6+ JavaScript |
| **Icons** | [Lucide](https://lucide.dev/) via CDN — minimal stroke icons, used sparingly |
| **Fonts** | [Google Fonts](https://fonts.google.com/) — IBM Plex Mono + IBM Plex Sans |
| **Animations** | CSS transitions + IntersectionObserver scroll-reveal |
| **Navigation** | Dependency-free command palette (`Ctrl/Cmd K`) |

> **Zero dependencies. Zero frameworks. Pure HTML, CSS & JavaScript.**

<br>

## 🚀 Getting Started

### Prerequisites

All you need is a modern web browser — no build tools, package managers, or servers required.

### Run Locally

```bash
# Clone the repository
git clone https://github.com/balirwaalvin/TREEZ-AFRICA-Systems.git

# Navigate into the project
cd TREEZ-AFRICA-Systems

# Open in your browser
# Windows
start index.html

# macOS
open index.html

# Linux
xdg-open index.html
```

Or simply open `index.html` directly in any web browser.

<br>

## 🌍 Our Services

<div align="center">

| Service | Description |
|:--------|:------------|
| 🌐 **Web Application Development** | Custom portals, PWAs, SaaS platforms, e-commerce |
| 📱 **Mobile App Development** | iOS, Android, Flutter, React Native, offline-first |
| 🏦 **Enterprise Banking Systems** | Core banking, payment gateways, PCI-DSS compliance |
| 🔧 **System Maintenance & Support** | 24/7 monitoring, security audits, cloud management |
| 💡 **IT Consulting & Planning** | Digital transformation, architecture, data strategy |
| 🎨 **UI/UX Design** | User research, wireframes, prototyping, design systems |

</div>

<br>

## 📬 Contact

<div align="center">

| Channel | Details |
|:--------|:--------|
| 🌐 **Website** | [treez.tech](https://treez.tech) |
| 📧 **Email** | care@treez.tech |
| 📞 **Phone** | +256 782 607 351 |
| 📍 **Office** | Kampala, Uganda, East Africa |
| 🏢 **Parent** | TREEZ AFRICA HOLDINGS |

</div>

<br>

## 🤝 Contributing

This is a proprietary project of TREEZ AFRICA SYSTEMS. For partnership inquiries, collaboration, or career opportunities, please reach out via our [Contact Page](https://treez.tech/contact/) or email us directly.

<br>

## 📜 License

Copyright © 2026 **TREEZ AFRICA SYSTEMS**. All rights reserved.

This project and its contents are proprietary to TREEZ AFRICA SYSTEMS, a subsidiary of TREEZ AFRICA HOLDINGS.

<br>

---

<div align="center">

<br>

**🌳 TREEZ AFRICA SYSTEMS**

*Developing today's solutions for tomorrow's Africa.*

<br>

Made with 💚 in Kampala, Uganda

<br>

[![GitHub](https://img.shields.io/badge/GitHub-balirwaalvin-181717?style=for-the-badge&logo=github)](https://github.com/balirwaalvin)

</div>

