# Privacy Policy — Colvio for Dynamics 365

**Last updated: March 26, 2026**

## Overview

Colvio is a free, open-source Chrome extension that helps users explore, query, export and load data from Microsoft Dynamics 365 / Dataverse environments. This privacy policy explains how Colvio handles your data.

## Data Collection

**Colvio does not collect, transmit, or store any personal data.**

Specifically:

- **No analytics or telemetry.** Colvio does not track usage, page views, clicks, or any user behavior.
- **No external servers.** All API requests go directly from your browser to your Dynamics 365 server. No data passes through any third-party or intermediary server.
- **No account required.** Colvio does not require you to create an account, sign up, or provide any personal information.
- **No advertising.** Colvio does not display ads and does not share data with advertisers.
- **No payment processing.** Colvio is completely free. No credit cards, no subscriptions.

## Data Storage

Colvio stores the following data **locally in your browser only** (via `chrome.storage.local` and `localStorage`):

| Data | Purpose | Retention |
|------|---------|-----------|
| Saved queries | Persist user-created query configurations | Until manually deleted |
| Query history | Last 20 executed queries for quick reload | Until manually cleared |
| Metadata cache | Speed up entity/field loading | Auto-expires (entities: 2h, fields: 1h) |
| Theme preference | Dark/Light mode setting | Until changed |
| Language preference | EN/FR interface language | Until changed |
| Onboarding status | Track if first-launch tour was completed | Permanent |

This data never leaves your browser and is only accessible to the Colvio extension.

## Data Access

Colvio accesses your Dynamics 365 environment using your existing browser session (Azure AD / Entra ID cookies). It inherits your security permissions — Colvio cannot access any data that your D365 user account does not have permission to view or modify.

## Permissions

| Permission | Purpose |
|------------|---------|
| `activeTab` | Detect the current D365 tab when you click the extension icon |
| `scripting` | Inject the API proxy script into the D365 tab |
| `storage` | Store saved queries, history, and metadata cache locally |
| `declarativeContent` | Show/hide the extension icon based on URL |
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
