/**
 * src/panel.jsx — React panel entry point
 *
 * Ce fichier est le entry point pour Vite :
 *   - En mode dev    : `npm run dev`  → localhost:5173
 *   - En mode build  : `npm run build` → chrome-extension/panel.js
 *
 * Il importe l'app principale (D365Inspector) et la monte dans #root.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app.jsx";

const root = createRoot(document.getElementById("root"));
root.render(React.createElement(App));
