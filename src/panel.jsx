/**
 * src/panel.jsx — React panel entry point
 * Dev: `npm run dev` -> localhost:5173
 * Build: `npm run build` -> chrome-extension/panel.js
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app.jsx";

const root = createRoot(document.getElementById("root"));
root.render(React.createElement(App));
