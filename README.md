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
│   ├── receipts.ts         # Invoices, receipts and the receipt email
│   └── smtp.ts             # Sends mail through Titan over SMTP
├── migrations/             # D1 (database) schema
├── scripts/                # create-admin.mjs, backup.mjs, backup-schedule.sh, mail-catcher.mjs
├── tests/                  # End-to-end API tests
│
└── public/                 # Everything visitors can load. Nothing outside it is served.
    ├── index.html              # Homepage — served at /
    ├── about/index.html        # About Us — served at /about/
    ├── services/index.html     # Our Services — served at /services/
    ├── portfolio/index.html    # Partners — served at /portfolio/
    ├── booking/index.html      # Book a Consultation — served at /booking/
    ├── blog/index.html         # Blog & Insights — served at /blog/
    ├── blog-post/index.html    # Blog Article Template — served at /blog-post/?id=…
    ├── contact/index.html      # Contact Us + FAQ — served at /contact/
    ├── admin/index.html        # Private admin workspace — served at /admin/
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
| Run locally, catching receipt emails | `npm run mail-catcher` + `npm run dev:mail-test` |
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
- **Preview before sending.** The PDF on the right is redrawn as you type, and it is exactly what gets attached. **Send to client** asks for confirmation, then emails the client and copies `receipts@treez.tech`. **Save without sending** keeps it to send later.
- **Safeguards.** A payment can't be more than the balance, or dated before the invoice's last payment. Receipt and invoice numbers must be unique. Sent receipts can't be deleted.
- **Numbers** are suggested in the house formats (`TAH-YYYYMMDD-NNN` for invoices, `TAH 8989 NNNN` for receipts), and both can be edited.

Sending goes through Titan's mail server (`smtp.titan.email`, port 465). The mailbox password is a Worker secret, set once and whenever it changes:

```sh
npx cf workers secrets update SMTP_PASSWORD
```

Until it is set, receipts still save, and sending reports that email isn't set up yet.

To try the whole flow without emailing anyone, run the mail catcher and the site in mail-test mode in two terminals. Every email is saved to `mail-catcher/` as an `.eml` file:

```sh
npm run mail-catcher
npm run dev:mail-test
```

Plain `npm run dev` has no mailbox password, so it can never reach the real mailbox.

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

