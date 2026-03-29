# Chrome Web Store Listing — Colvio

## Short Description (132 chars max)
Free data explorer for Dynamics 365 / Dataverse. Query, inspect, load, audit, export — directly from the browser.

## Detailed Description

Colvio — The Free Data Explorer for Microsoft Dynamics 365 / Dataverse

Colvio is a free, open-source Chrome extension that gives D365 consultants, admins, and developers instant access to their Dataverse data — directly from the browser, with zero configuration.

No API keys. No app registration. No subscription. No account. Just click the icon on any D365 page and start exploring.

The free, in-browser data toolkit that Dynamics 365 has been missing.

KEY FEATURES

Data Explorer
Query any entity with a visual query builder. Smart field picker with type filtering. Multi-filter WHERE with AND/OR groups. Expand parent AND child relationships. FetchXML and raw OData modes. Auto-pagination, virtual scrolling (60fps on 10k+ records), inline cell editing, bulk update and delete.

Show All Data
Auto-detects the record open in your D365 tab. One click to inspect every field with logical name, type, and value. Copy individual fields or full JSON.

Metadata Browser
Browse entities, fields, and OptionSet values with codes, labels, and descriptions. Export all OptionSets as CSV for offline documentation.

Data Loader
Import CSV or paste from Excel. Smart auto-mapping, lookup resolution, transforms (statecode, picklist, boolean, date). OData $batch for 10x faster imports. CREATE or UPSERT with alternate key support.

Relationship Graph
Visual SVG graph of entity relationships: N:1 parents, 1:N children, N:N many-to-many. Depth 1-2, click nodes to drill down.

Solution Explorer
Browse D365 solutions and their components. 13 component types resolved to readable names (Entity, Attribute, View, Plugin, Web Resource, etc.).

Translation Manager
View and edit field labels in multiple languages. Export/import CSV for bulk translation workflows. Auto-publish after save.

User & License Monitor
Monitor ALL D365 users — Access Mode, CAL Type, Business Unit, security roles, last login date. Filter by Active/Disabled/Non-Interactive, identify unused licenses (never logged in, disabled but still allocated). Full CSV export. No limit on user count.

Security Audit
Review all security roles and their privileges. Readable labels (prvDeleteAccount becomes Delete · Account), depth badges (User/BU/Org), sensitive privilege flags (30+ critical privileges highlighted). Filter by Org-level or Sensitive. CSV export per role.

Login History
User login/logout audit timeline from D365 audit logs. Session duration, access type stats, CSV export.

Help & Onboarding
Built-in feature guide, first-launch tour, keyboard shortcuts panel, contextual tooltips.

GLOBAL

Dark/Light theme with system preference detection
English/French interface toggle
Export: XLSX, CSV, JSON — copy or download
Keyboard shortcuts (Ctrl+Enter to query, Ctrl+/ for shortcuts, Escape to close)
Session expiration detection with Reconnect button
Query History (last 20 queries) + Saved Queries (20 max)
5 pre-built query templates for common tasks

SECURITY & PRIVACY — Full audit: 0 critical, 0 high findings

Zero data collection — no analytics, no telemetry, no external servers
All requests go directly from your browser to your D365 server
Uses your existing Azure AD / Entra ID session — no credentials stored
Input validation on all API parameters (entity names, GUIDs, search terms)
OData injection protection — numeric and GUID values validated before query insertion
CSV export formula injection protection — prevents spreadsheet formula execution
Content Security Policy enforced on extension pages
Bulk operation safeguards — typed confirmation on delete, confirm dialog on bulk update
CanBeDeleted pre-check — verifies entity permissions before allowing delete operations
Client-side rate limiting — max 10 requests/second to prevent API abuse
Role-based tab visibility — sensitive modules auto-hidden for non-admin users
Only 3 runtime dependencies (React, React-DOM, xlsx export-only)
Open source — audit the code yourself on GitHub

BUILT WITH SECURITY IN MIND

Colvio goes beyond what similar tools offer in terms of safety:
Typed confirmation required before any bulk delete (you must type the entity name)
Entity CanBeDeleted metadata check before delete operations are allowed
Confirm dialog on bulk update showing field name, value, and record count
Rate limiting prevents accidental API flooding (10 req/sec cap)
OData and GUID input validation prevents injection attacks
CSV formula injection protection on all exports
Role-based access control hides admin-only modules from standard users
Content Security Policy blocks unauthorized script execution
PII stripping in query history — filter values are not persisted
All write operations respect your D365 security roles — Colvio cannot bypass server-side permissions

ROLE-BASED ACCESS

Some modules require elevated D365 permissions and are automatically hidden for non-admin users:
Available to all users: Data Explorer, Show All Data, Metadata Browser, Data Loader, Relationship Graph, Help
Requires System Administrator or System Customizer: Solution Explorer, Translation Manager, Login History, Users & Licenses, Security Audit
Colvio detects your permissions at startup and only shows the tabs you can access. No error screens, no confusion.

SUPPORTED REGIONS

Works on all Dynamics 365 / Dataverse environments worldwide:
NA, EMEA, APAC, UK, France, Canada, Australia, Japan, India, UAE, South Africa, and all crm*.dynamics.com domains.

100% FREE & OPEN SOURCE

No freemium. No paywalls. No "Pro" tier. Colvio is free for everyone, forever.
Source code, documentation, and security audit available on GitHub.
github.com/zmissoum/colvio

PERFECT FOR

D365 consultants exploring a new org
Admins troubleshooting data issues
Developers testing API queries
Data migration teams loading/extracting data
Salesforce consultants transitioning to D365
Anyone who needs quick access to Dataverse data

## Category
Developer Tools

## Language
English

## Screenshots Needed (1280x800 or 640x400)
1. Data Explorer — query builder with results table (dark theme)
2. Show All Data — record inspector with field details
3. Data Loader — CSV mapping wizard with preview
4. Relationship Graph — SVG entity relationship diagram
5. Solution Explorer — solution components with resolved names
6. Metadata Browser — entity fields with OptionSet viewer
