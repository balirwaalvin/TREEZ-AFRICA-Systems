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
- Modern, responsive design across all devices
- Brand-consistent color palette (Blue, Green, Yellow, Black, White)
- Interactive particle canvas animation on hero
- Smooth scroll-reveal animations on every page
- Animated counters, carousels & accordions
- Card tilt effects & hover micro-interactions
- Custom scrollbar & page preloader

</td>
<td width="50%">

### ⚙️ Functionality
- **Multi-step booking form** with validation & review
- **Portfolio filtering** by category with modal case studies
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
| 🏠 **Home** | Hero with particle animation, about snapshot, services overview, trust bar, testimonials carousel, CTA |
| 📖 **About** | Company timeline, mission/vision/values, team grid with hover overlays |
| 🛠️ **Services** | 5 detailed service sections, technology stack grid, "How We Work" process stepper |
| 💼 **Portfolio** | Filterable project grid (Web, Mobile, Enterprise, FinTech) with modal case studies |
| 📅 **Booking** | 4-step consultation form: Contact → Services → Project Details → Review & Submit |
| 📝 **Blog** | Article listing with thumbnails, categories, and reading times |
| 📰 **Blog Post** | Full article template with share buttons and related posts |
| 📞 **Contact** | Contact form, info cards, Google Maps embed, 7-item FAQ accordion |

<br>

## 🗂️ Project Structure

```
TREEZ-AFRICA-Systems/
│
├── index.html              # Homepage
├── about.html              # About Us
├── services.html           # Our Services
├── portfolio.html          # Project Portfolio
├── booking.html            # Book a Consultation
├── blog.html               # Blog & Insights
├── blog-post.html          # Blog Article Template
├── contact.html            # Contact Us + FAQ
├── favicon.svg             # Brand favicon
│
├── css/
│   ├── global.css          # Reset, variables, typography, utilities
│   ├── animations.css      # Keyframes & scroll-reveal classes
│   ├── header.css          # Sticky navbar & mobile menu
│   ├── footer.css          # Footer layout & newsletter
│   ├── home.css            # Homepage-specific styles
│   ├── about.css           # About & page-hero styles
│   ├── services.css        # Service details & tech stack
│   ├── portfolio.css       # Portfolio grid, filter & modal
│   ├── booking.css         # Multi-step form & sidebar
│   ├── blog.css            # Blog grid & article styles
│   └── contact.css         # Contact form, map & FAQ
│
├── js/
│   ├── main.js             # Navbar, preloader, smooth scroll
│   ├── animations.js       # IntersectionObserver, counters, parallax
│   ├── particles.js        # Interactive canvas particle network
│   ├── testimonials.js     # Auto-play carousel with swipe
│   ├── booking.js          # Multi-step form logic & validation
│   ├── portfolio.js        # Filter, modal & case study data
│   └── contact.js          # Contact form validation & FAQ accordion
│
└── assets/
    ├── images/             # Project images & backgrounds
    └── icons/              # Custom SVG icons
```

## 🔐 Admin Workspace

The private admin workspace is available at `admin.html` and is intentionally linked only by a low-contrast key icon in the footer. It uses Appwrite email/password authentication and the IDs in `js/appwrite-config.js`.

Do not open `admin.html` with a `file://` URL. Start a local server from the project folder with `python3 -m http.server 8000`, then open `http://localhost:8000/admin.html`. In the Appwrite console, add `localhost` as a Web platform (or add `http://localhost:8000` if the console asks for a full hostname) before testing login.

Create an Appwrite collection named `analyticscollection` in the configured database with string attributes `page` and `path`. The existing `messagescollection` needs string attributes `name`, `email`, `phone`, `subject`, and `message`. The `treez-systems` collection needs string attributes `title`, `category`, `author`, `date`, `readTime`, `excerpt`, `content`, plus a boolean `published` attribute.

Allow unauthenticated users to create documents in the messages and analytics collections. Allow authenticated users to list, create, update, and delete documents in the blog collection and list documents in the messages and analytics collections. Create the admin user in Appwrite and use that account to sign in at `admin.html`.

<br>

## 🎨 Brand Colors

<div align="center">

| Color | Hex | Usage |
|:------|:----|:------|
| 🔵 **Blue** | `#0052CC` | Primary — CTAs, headings, links |
| 🟢 **Green** | `#00A651` | Secondary — accents, labels, success states |
| 🟡 **Yellow** | `#FFD700` | Highlight — badges, special accents |
| ⚫ **Black** | `#1A1A1A` | Dark backgrounds, body text |
| ⚪ **White** | `#FFFFFF` | Backgrounds, contrast text |

</div>

<br>

## 🛠️ Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Markup** | Semantic HTML5 |
| **Styling** | Vanilla CSS3 (Custom Properties, Grid, Flexbox, `@keyframes`) |
| **Interactivity** | Vanilla ES6+ JavaScript |
| **Icons** | [Boxicons](https://boxicons.com/) via CDN |
| **Fonts** | [Google Fonts](https://fonts.google.com/) — Poppins + Inter |
| **Animations** | CSS transitions + IntersectionObserver scroll-reveal |
| **Canvas** | HTML5 Canvas API (particle network) |

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
| 🌐 **Website** | [treezafrica.systems](https://treezafrica.systems) |
| 📧 **Email** | info@treezafrica.systems |
| 📞 **Phone** | +256 700 000 000 |
| 📍 **Office** | Kampala, Uganda, East Africa |
| 🏢 **Parent** | TREEZ AFRICA HOLDINGS |

</div>

<br>

## 🤝 Contributing

This is a proprietary project of TREEZ AFRICA SYSTEMS. For partnership inquiries, collaboration, or career opportunities, please reach out via our [Contact Page](https://treezafrica.systems/contact.html) or email us directly.

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

