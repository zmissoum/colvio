# Privacy Policy — Colvio for Dynamics 365

**Last updated: October 14, 2026**

## Overview

Colvio is a free, open-source Chrome extension that helps users explore, query, export and load data from Microsoft Dynamics 365 / Dataverse environments. This privacy policy explains how Colvio handles your data.

## Data Handling

**Colvio does not transmit, sell or share any data. Everything it reads from your Dynamics 365 environment is processed in your browser, and what it keeps stays there.**

What Colvio handles — locally, on your device (the same categories are declared in the Chrome Web Store privacy section):

- **Website content** — the data of your own Dynamics 365 / Dataverse environment that you choose to look at: records, users, security roles, metadata, logs. It is displayed, exported only to files you download yourself, and cached locally as described under *Data Storage*.
- **User activity (your Dynamics 365 tab's network requests)** — for Record activity, Colvio observes, read-only, the Web API writes your Dynamics 365 tab sends to your own environment (a form save, for instance): the record, the table, the **column names — never their values** —, the status, the timing and the request ids. They are kept in session memory and cleared when the browser closes. Requests are never blocked, modified, or sent anywhere.

Specifically:

- **No analytics or telemetry.** Colvio does not track usage, page views, clicks, or any user behavior.
- **No external servers.** All API requests go directly from your browser to your Dynamics 365 server. No data passes through any third-party or intermediary server.
- **No account required.** Colvio does not require you to create an account, sign up, or provide any personal information.
- **No advertising.** Colvio does not display ads and does not share data with advertisers.
- **No payment processing.** Colvio is completely free. No credit cards, no subscriptions.

## Data Storage

Colvio stores the following data **locally in your browser only** (via `chrome.storage.local`, `chrome.storage.session` and `localStorage`):

| Data | Purpose | Retention |
|------|---------|-----------|
| Saved queries | Persist user-created query configurations | Until manually deleted |
| Query history | Last 20 executed queries for quick reload (filter values are stripped before saving) | Until manually cleared |
| API Tester history | Last 50 ad-hoc requests for quick reload — secret-bearing headers (`Authorization`, `Cookie`, API keys) are **redacted before saving** | Until manually cleared |
| Data Loader templates | Saved column-mapping configurations (no row data) | Until manually deleted |
| Metadata cache | Speed up entity/field loading (org-scoped keys, no record data) | Auto-expires (entities: 2h, fields: 1h) |
| Theme preference | Dark/Light mode setting | Until changed |
| Language preference | EN/FR interface language | Until changed |
| Onboarding status | Track if first-launch tour was completed | Permanent |
| Record activity saves (`chrome.storage.session`) | The writes your Dynamics 365 tab sent (record id, table, **column names only — never values**, status, timing, request ids), so Show All Data can show what each save triggered | Memory only — cleared when the browser closes (200 per environment at most) |
| Trace log revert | The previous plug-in trace log setting to restore after a debugging session you started | Until restored |

This data never leaves your browser and is only accessible to the Colvio extension. Imported CSV/Excel file contents are processed in memory only and are never persisted.

## Data Access

Colvio accesses your Dynamics 365 environment using your existing browser session (Azure AD / Entra ID cookies). It inherits your security permissions — Colvio cannot access any data that your D365 user account does not have permission to view or modify.

## Permissions

| Permission | Purpose |
|------------|---------|
| `scripting` | Inject the API proxy script into the D365 tab |
| `storage` | Store saved queries, history, and metadata cache locally |
| `declarativeContent` | Show/hide the extension icon based on URL |
| `webRequest` | **Observe** (read-only) the Web API writes your Dynamics 365 tab sends, so Record activity can list each save and find what it triggered — requests are never blocked, modified or sent anywhere |
| `alarms` | Set the plug-in trace log back to its previous value at the time you chose |
| `host_permissions: *.dynamics.com` | Execute API calls to Dynamics 365 servers |

## Data Deletion

- **Saved queries & history**: Use the "Clear metadata cache" button in the sidebar, or uninstall the extension.
- **All local data**: Uninstalling the extension removes all stored data.

## Third-Party Services

Colvio does not use any third-party services, SDKs, or libraries that collect data. The only external API accessed is the Microsoft Dynamics 365 / Dataverse OData API, using your existing authenticated session.

## Children's Privacy

Colvio is a professional tool for Dynamics 365 administrators and consultants. It is not directed at children under 13.

## Changes

We may update this privacy policy from time to time. Changes will be posted in this document and reflected in the "Last updated" date.

## Contact

For questions about this privacy policy, please open an issue on [GitHub](https://github.com/zmissoum/colvio/issues).
