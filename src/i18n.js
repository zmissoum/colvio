import en from "./locales/en.js";
import fr from "./locales/fr.js";

const locales = { en, fr };
let current = "en";
try { current = localStorage.getItem("colvio_locale") || "en"; } catch {}

export function t(key) { return locales[current]?.[key] || locales.en[key] || key; }
export function setLocale(l) { current = l; try { localStorage.setItem("colvio_locale", l); } catch {} }
export function getLocale() { return current; }
