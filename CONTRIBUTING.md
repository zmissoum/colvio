# Contributing to Colvio

Thank you for your interest in contributing to Colvio! Colvio is a free, open-source Chrome extension for Dynamics 365 / Dataverse. Contributions of all kinds are welcome.

## Getting Started

1. Fork the repository
2. Clone: `git clone https://github.com/YOUR_USERNAME/colvio.git`
3. Install: `npm install`
4. Dev server: `npm run dev` — opens standalone mode with mock data
5. Build: `npm run build` — outputs to `dist/`
6. Test in Chrome: `chrome://extensions` > Developer Mode > Load unpacked > `dist/`

## Project Structure

```
src/
  app.jsx          — Main App shell (tabs, sidebar, theme, onboarding)
  shared.jsx       — Shared utilities (icons, colors, styles, hooks)
  d365-bridge.js   — API bridge (extension <-> D365, with mock data for dev)
  panel.jsx        — React entry point
  i18n.js          — Internationalization engine
  locales/
    en.js          — English strings
    fr.js          — French strings
  components/
    Explorer.jsx        — Data Explorer (query builder + results)
    Results.jsx         — Query results table with virtual scrolling
    VirtualTable.jsx    — Virtual scrolling engine
    Loader.jsx          — Data Loader (CSV import wizard)
    MetadataBrowser.jsx — Entity/field/OptionSet browser
    RelationshipGraph.jsx — SVG entity relationship viewer
    SolutionExplorer.jsx  — Solution component browser
    TranslationManager.jsx — Multi-language label editor
    LoginHistory.jsx    — User audit timeline
    HelpTab.jsx         — Feature guide
    OnboardingTour.jsx  — First-launch walkthrough
    QueryTemplates.jsx  — Pre-built query templates
    ShortcutsPanel.jsx  — Keyboard shortcuts modal
    Tooltip.jsx         — Contextual help tooltips
    ErrorBoundary.jsx   — Crash recovery wrapper
content.js         — Chrome extension content script (D365 API proxy)
background.js      — Chrome extension service worker
manifest.json      — Chrome Manifest V3
```

## Development Guidelines

- **No external UI dependencies** — all styling is inline using the shared `C` color object
- **Theme-aware** — use `C.bg`, `C.tx`, `C.sf`, etc. for colors; use `inp()`, `bt()`, `crd()` style helpers
- **i18n** — use `t("key")` for all user-facing strings, add keys to both `en.js` and `fr.js`
- **Security** — validate all user inputs in content.js using `validateName()`, `validateGuid()`, `sanitizeSearchTerm()`
- **No console.log/error in production** — use try/catch silently or remove debug logs before committing
- **Keep it simple** — avoid over-engineering, no unnecessary abstractions

## Adding a New Feature

1. Create a new component in `src/components/YourFeature.jsx`
2. Add it as a tab in `src/app.jsx` (icon + label + component)
3. Add i18n keys in both `src/locales/en.js` and `src/locales/fr.js`
4. If it needs D365 API calls, add the action in `content.js` and the bridge method in `d365-bridge.js` (with mock data for standalone)
5. Use the shared color/style system (`C`, `inp()`, `bt()`, `crd()`, `mono`)

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Run `npm run build` to verify no errors
4. Test in Chrome with the extension loaded
5. Submit a PR with a clear description

## Reporting Issues

Open an issue on [GitHub](https://github.com/zmissoum/colvio/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- D365 environment region (if relevant)
- Browser version
