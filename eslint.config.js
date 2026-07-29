// Minimal, high-signal lint — tuned for the bug classes that actually bit us, not style:
//  - no-undef:     the "deltaSelect is not defined" class (block-scoped const read elsewhere)
//  - no-dupe-keys: duplicate keys in the big locale objects silently overwrite each other
//  - no-redeclare / no-self-assign / no-unreachable / valid-typeof: cheap real-bug catchers
// Style rules are deliberately absent; `npm run lint` must stay actionable, not noisy.
import globals from "globals";

export default [
  {
    files: ["src/**/*.{js,jsx}", "content.js", "background.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        process: "readonly", // vite define / import.meta era guards
      },
    },
    rules: {
      "no-undef": "error",
      "no-dupe-keys": "error",
      "no-redeclare": "error",
      "no-self-assign": "error",
      "no-unreachable": "error",
      "valid-typeof": "error",
      "no-dupe-args": "error",
      "no-constant-binary-expression": "error",
    },
  },
  {
    files: ["src/__tests__/**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
