// YouTube upload kit for the per-module deep dives: for every rendered deep dive (the chapter
// timings make-deep.mjs writes next to each MP4), an upload copy, a thumbnail, and the title,
// description with chapters and tags — then the upload pre-flight (youtube-check.mjs) on each.
//
//   node make-deep.mjs --module=health --lang=en --res=1440   # render (writes …_en_1440.mp4 + .json)
//   node youtube-deep.mjs                                     # every 1440p EN deep dive found
//   node youtube-deep.mjs --res=1080 --module=health,script   # other resolution / some modules
//
// → out/upload/colvio_<key>_en.mp4 (silent stereo AAC track, moov first — upload THIS one),
//   out/upload/colvio_<key>_thumb.jpg (1280×720, the video's title card), store/youtube-deep.md.
import fs from "node:fs";
import path from "node:path";
import { HERE, ffmpeg } from "./lib.mjs";
import { checkUpload, groupChapters, mmss } from "./youtube-check.mjs";

const args = process.argv.slice(2);
const arg = (k) => args.find(a => a.startsWith(`--${k}=`))?.split("=")[1];
const RES = arg("res") || "1440";
const SUFFIX = RES === "1080" ? "" : `_${RES}`;
const ONLY = (arg("module") || "").split(",").filter(Boolean);
const DEEP = path.join(HERE, "out", "deep");
const UP = path.join(HERE, "out", "upload");
const STORE = "https://chromewebstore.google.com/detail/edieednbdaclheikneelkjfbckibhdgl";
const REPO = "https://github.com/zmissoum/colvio";

// What each video is about, as someone would search for it (+ " | Colvio" ≤ 100 characters).
const TOPIC = {
  explorer: "Query Dataverse your way: Builder, OData, FetchXML or SQL",
  loader: "Load Excel and CSV into Dynamics 365 safely: dry run, upsert, rollback",
  recyclebin: "Restore deleted Dynamics 365 records from the Dataverse recycle bin",
  showalldata: "Every field of a Dynamics 365 record on one screen",
  apitester: "Test the Dataverse Web API from your browser session",
  metadata: "Browse Dataverse metadata: tables, columns, choices, schema diff",
  automation: "Every plug-in step, workflow and process of a Dynamics 365 org in one list",
  apps: "Inside your model-driven apps: tables, forms, views, commands",
  relationships: "Map Dataverse table relationships, step by step",
  schema: "Draw your Dataverse data model as an ERD in seconds",
  solutions: "Browse, export and compare Dynamics 365 solutions across environments",
  envvars: "Dataverse environment variables: defaults, overrides, missing values",
  translations: "Translate Dynamics 365 labels in bulk, with a CSV round trip",
  licenses: "Dynamics 365 users and licenses: who has what, bulk user settings",
  bu: "Dynamics 365 business units: tree, members, bulk moves",
  security: "Read Dynamics 365 security roles: privileges, matrix, assignments",
  teams: "Dynamics 365 teams: owner, Microsoft Entra group and access teams",
  adoption: "Who really uses Dynamics 365? Adoption analytics from the audit log",
  logins: "Dynamics 365 login history: what the audit really records",
  storage: "What fills your Dataverse storage? Rows and files per table",
  health: "Dynamics 365 health check: what silently hurts your environment",
  script: "JavaScript on the Dataverse Web API, with a dry run and a rollback",
  webres: "Edit Dynamics 365 web resources and find a column inside every script",
  access: "Why can't this user see the record? Dynamics 365 record access explained",
  whoruns: "Who runs your Dynamics 365 automation, and what fires when a column changes",
  datamodel: "Know your Dataverse data model: fill rate, dependencies, solution layers",
  modelwrites: "Edit choice values and create columns from a file in Dataverse",
  sqlpower: "SQL on Dataverse: completion, previewed UPDATE, save as a view",
  association: "Load many-to-many tables in Dynamics 365: add users to teams from a file",
  deployments: "Dynamics 365 solution deployment history: what, when, who, what failed",
};
// Order on the channel / in the kit: the module tour order, then the later capabilities.
const ORDER = ["explorer", "loader", "recyclebin", "showalldata", "apitester", "script", "metadata", "automation", "apps", "relationships", "schema",
  "solutions", "envvars", "webres", "translations", "licenses", "bu", "security", "teams", "adoption", "logins", "storage", "health",
  "access", "sqlpower", "whoruns", "datamodel", "modelwrites", "deployments", "association"];
const TAGS = {
  explorer: ["FetchXML", "Dataverse SQL", "OData"], loader: ["Dynamics 365 data import", "Excel import", "upsert"],
  recyclebin: ["Dataverse recycle bin", "restore deleted records"], showalldata: ["Dynamics 365 record", "all fields"],
  apitester: ["Dataverse Web API", "Postman alternative"], metadata: ["Dataverse metadata", "option sets"],
  automation: ["plug-in steps", "workflows", "Power Automate"], apps: ["model-driven apps", "app designer"],
  relationships: ["Dataverse relationships", "lookups"], schema: ["ERD", "data model diagram"],
  solutions: ["Dynamics 365 solutions", "ALM"], envvars: ["environment variables", "ALM"],
  translations: ["Dynamics 365 translations", "localization"], licenses: ["Dynamics 365 licenses", "user settings"],
  bu: ["business units", "Dynamics 365 security"], security: ["security roles", "privileges"],
  teams: ["Dynamics 365 teams", "Entra ID groups"], adoption: ["Dynamics 365 adoption", "audit log"],
  logins: ["login history", "audit log"], storage: ["Dataverse storage", "capacity"],
  health: ["Dynamics 365 health check", "governance"], script: ["Dataverse JavaScript", "data fix", "rollback"],
  webres: ["web resources", "JavaScript", "form scripts"], access: ["record access", "security roles", "sharing"],
  whoruns: ["Power Automate", "plug-in steps", "service accounts"], datamodel: ["data model", "dependencies", "solution layers"],
  modelwrites: ["choice columns", "create columns", "XrmToolBox alternative"], sqlpower: ["Dataverse SQL", "SQL 4 CDS alternative"],
  association: ["N:N relationship", "team membership", "data import"], deployments: ["solution history", "ALM", "deployments"],
};
const BASE_TAGS = ["Dynamics 365", "Dataverse", "Power Platform", "Power Apps", "D365", "Dynamics 365 CRM", "Chrome extension", "Colvio"];

const found = fs.existsSync(DEEP) ? fs.readdirSync(DEEP).filter(f => new RegExp(`^colvio_[a-z]+_en${SUFFIX}\\.json$`).test(f)) : [];
const keys = found.map(f => f.match(/^colvio_([a-z]+)_en/)[1]).filter(k => !ONLY.length || ONLY.includes(k))
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
if (!keys.length) { console.error(`no rendered deep dive found in out/deep (…_en${SUFFIX}.json) — render first: node make-deep.mjs --module=<key> --lang=en${SUFFIX ? ` --res=${RES}` : ""}`); process.exit(2); }
fs.mkdirSync(UP, { recursive: true });

const kits = [];
const problems = [];
for (const key of keys) {
  const meta = JSON.parse(fs.readFileSync(path.join(DEEP, `colvio_${key}_en${SUFFIX}.json`), "utf8"));
  const src = path.join(DEEP, `colvio_${key}_en${SUFFIX}.mp4`);
  const upload = path.join(UP, `colvio_${key}_en.mp4`);
  const thumb = path.join(UP, `colvio_${key}_thumb.jpg`);
  // upload copy: the video as rendered, a silent stereo AAC track (YouTube's recommended layout),
  // moov first; its own folder, so a re-render can't rewrite it mid-upload
  ffmpeg(["-i", src, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", upload], `upload ${key}`);
  // thumbnail: the title card ("Colvio · <module>", its tagline), on screen from the first frame
  ffmpeg(["-ss", "1.0", "-i", src, "-frames:v", "1", "-vf", "scale=1280:720:flags=lanczos", "-q:v", "3", thumb], `thumbnail ${key}`);
  const chapters = groupChapters(meta.chapters, meta.seconds);
  const title = `${TOPIC[key] || meta.label} | Colvio`;
  const description = [
    meta.tagline,
    "",
    "Colvio is a free, open-source browser extension for Microsoft Dynamics 365 and Dataverse. It runs on the session you're already signed in with and talks only to your own org: no account, no app registration, no telemetry.",
    "",
    "Chapters",
    ...chapters.map(c => `${mmss(c.at)} ${c.title}`),
    "",
    "Demo data only: no real organization on screen.",
    "",
    `Chrome Web Store: ${STORE}`,
    `Source code: ${REPO}`,
    "",
    "#Dynamics365 #Dataverse #PowerPlatform",
  ].join("\n");
  const tags = [...BASE_TAGS, ...(TAGS[key] || [])];
  const issues = checkUpload({ file: upload, title, description, tags, thumbnail: thumb });
  if (issues.length) problems.push(...issues.map(i => `${key}: ${i}`));
  kits.push({ key, meta, title, description, tags, chapters, issues });
  console.log(`${issues.length ? "✗" : "✓"} ${key} — ${mmss(meta.seconds)}, ${chapters.length} chapters${issues.length ? `\n    · ${issues.join("\n    · ")}` : ""}`);
}

const md = `# YouTube upload kit — module videos (${kits.length})

Generated by \`node youtube-deep.mjs\` from the last ${RES}p EN renders (\`node make-deep.mjs --module=<key> --lang=en --res=${RES}\`) — re-run both after a UI change (the chapter times move). Every file below passed the upload pre-flight (\`youtube-check.mjs\`): H.264 High, yuv420p, 30 fps, 16:9, a stereo AAC track, moov first, under 15 min; title ≤ 100 characters, description ≤ 5,000 bytes, no < or >, tags ≤ 500 characters, chapters from 0:00, at least 3, each at least 10 s; thumbnail 1280×720 under 2 MB.

Upload the copies in \`tools/video/out/upload/\` — not \`out/deep/\`, which every render rewrites.

## Settings (every video)

- Audience: **No, it's not made for kids** · Category: Science & Technology · Video language: English
- Visibility: Public · Allow embedding: on · License: Standard YouTube License
- Thumbnail: the \`_thumb.jpg\` next to the video (custom thumbnails need a phone-verified channel)
- Playlist: **Colvio — every module** (in the order below), with the tour (\`store/youtube-tour.md\`) first

| # | Video | Length | Upload file |
|---|---|---|---|
${kits.map((k, i) => `| ${i + 1} | ${k.meta.label} | ${mmss(k.meta.seconds)} | \`out/upload/colvio_${k.key}_en.mp4\` |`).join("\n")}
${kits.map((k, i) => `
---

## ${i + 1}. ${k.meta.label} (\`${k.key}\`, ${mmss(k.meta.seconds)})

Files: \`tools/video/out/upload/colvio_${k.key}_en.mp4\` · thumbnail \`tools/video/out/upload/colvio_${k.key}_thumb.jpg\`

**Title**

\`\`\`text
${k.title}
\`\`\`

**Description**

\`\`\`text
${k.description}
\`\`\`

**Tags**

\`\`\`text
${k.tags.join(", ")}
\`\`\`
`).join("")}`;
fs.writeFileSync(path.join(HERE, "..", "..", "store", "youtube-deep.md"), md);
console.log(`\n${problems.length ? `✗ ${problems.length} problem(s)` : `✓ ${kits.length} videos pass the upload pre-flight`} — store/youtube-deep.md, files in out/upload/`);
if (problems.length) process.exitCode = 1;
