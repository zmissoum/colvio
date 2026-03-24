# Contributing to Colvio

Thank you for your interest in contributing to Colvio!

## Getting Started

1. Fork the repository
2. Clone: `git clone https://github.com/YOUR_USERNAME/colvio.git`
3. Install: `npm install`
4. Dev server: `npm run dev` → open `panel.html` in browser
5. Build: `npm run build`

## Project Structure

```
src/
  app.jsx          — Main App shell (tabs, sidebar, theme)
  shared.jsx       — Shared utilities (icons, colors, styles, hooks)
  d365-bridge.js   — API bridge (extension ↔ D365)
  panel.jsx        — React entry point
  i18n.js          — Internationalization
  locales/         — EN/FR translations
  components/      — One file per feature tab
content.js         — Chrome extension content script (D365 API proxy)
background.js      — Chrome extension service worker
```

## Development Guidelines

- **No external UI dependencies** — all styling is inline using the shared `C` color object
- **Theme-aware** — use `C.bg`, `C.tx`, etc. for colors; use `inp()`, `bt()`, `crd()` style helpers
- **i18n** — use `t("key")` for user-facing strings, add keys to both `en.js` and `fr.js`
- **Security** — validate all user inputs in content.js using `validateName()`, `validateGuid()`, `sanitizeSearchTerm()`

## Pull Requests

1. Create a feature branch
2. Make your changes
3. Run `npm run build` to verify
4. Submit a PR with a clear description

## Reporting Issues

Open an issue on [GitHub](https://github.com/zmissoum/colvio/issues).
