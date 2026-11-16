# Colvio product video — automated

Generates the product walkthrough videos with **no manual recording**: Playwright drives the
**built** extension (`dist/`) in demo mode, the Chrome DevTools screencast captures it, an in-page
overlay adds captions, an animated cursor and title cards, and ffmpeg encodes MP4 1080p.

Not part of the extension bundle — its own `package.json`, its own `node_modules`.

## Setup (once)

```bash
cd tools/video
npm install
```

Uses the **installed Google Chrome** (Playwright `channel: "chrome"`) with a throwaway profile —
never your own sessions. (Playwright's downloaded Chromium fails to start on some Windows setups
with "side-by-side configuration is incorrect".) ffmpeg comes from `ffmpeg-static`.

On Linux / CI without Google Chrome: `COLVIO_VIDEO_CHROMIUM=bundled` uses Playwright's own Chromium
(or give the path of a Chromium executable), and `FFMPEG_PATH=/usr/bin/ffmpeg` uses a system ffmpeg
instead of `ffmpeg-static`.

## Run

```bash
npm run build            # at the repo root — the video films dist/
cd tools/video
node make-video.mjs                # EN + FR: full tours + one clip per module
node make-video.mjs --lang=fr      # one language
node make-video.mjs --no-clips     # full tours only
node recon.mjs                     # screenshot every module's landing screen (demo-content check)
```

Outputs land in `tools/video/out/` (git-ignored):

- `video/colvio_tour_en.mp4`, `video/colvio_tour_fr.mp4` — intro card, 23 modules (every module but System Ops, which needs a real org), outro card (~3 min 15 s)
- `video/clips_en/NN_<module>.mp4`, `video/clips_fr/…` — one clip per module, for LinkedIn posts
- `video/summary.json` — duration, scene count and console errors per language

## Per-module deep dives

One module, every feature, chapter by chapter (1 to 1 min 40 s each):

```bash
node make-deep.mjs --module=explorer                    # EN + FR → out/deep/colvio_explorer_<lang>.mp4
node make-deep.mjs --module=explorer,teams,storage      # several, one after the other
node make-deep.mjs --module=explorer --probe            # no recording: one screenshot per chapter end state
node make-deep.mjs --module=explorer --probe --port=5201  # own port, to probe modules in parallel
```

A module is a file `deep/<key>.mjs` exporting `{ key, label, tagline: {en, fr}, chapters }`, where
each chapter is `{ key, pos?, en: [title, text], fr: [title, text], run: async (h) => … }`
(`pos: "top"` moves the caption up when the action happens in the lower half of the screen).
A module may also export `storage: { key: value }` — localStorage set before the page loads, for a
demo flag of that video only: `health` sets `colvio_demo_production` (src/demoProduction.js, demo
mode only) so the demo org is a production one and "Unmanaged solutions in production" has a
finding; every other video keeps the sandbox demo org.
Write the chapters, run `--probe` until every chapter passes and every screenshot shows what the
caption claims, then render. Render one module at a time (or a comma list in one run): parallel
renders compete for the CPU and the screencast drops frames.

Available (30): one per module — `explorer`, `loader`, `recyclebin`, `showalldata`, `apitester`,
`metadata`, `automation`, `apps`, `relationships`, `schema`, `solutions`, `envvars`, `translations`,
`licenses`, `bu`, `security`, `teams`, `adoption`, `logins`, `storage`, `health`, `script`, `webres` —
and seven on capabilities added inside modules after the first series: `access` (Show All Data ›
Record access + Record activity), `whoruns` (Automation › who runs it, Fires on, step writes),
`datamodel` and `modelwrites` (Metadata), `sqlpower` (Explorer › SQL completion, UPDATE preview, Save
as view), `association` (Data Loader › N:N tables), `deployments` (Solutions › Deployments).
Every write asks for a confirmation in the app's own dialog (no native `window.confirm`, which never
showed in a screencast): `h.confirmed(button)` clicks the write button, leaves the dialog's text on
screen, then clicks OK (`h.confirm("cancel")` answers Cancel). Some chapters feed the page in-memory
files through Playwright's file chooser (a solution-compare file, a schema snapshot, a translations
CSV) — nothing is downloaded or read from disk, and download buttons are only hovered. The tour's
Data Loader, Recycle Bin, API Tester and Schema scenes replay the first chapters of these scripts.

Selectors: the Explorer's query tabs stay mounted (hidden) while another module is open — always
target visible elements (`h.vis(text)`, `>> visible=true`).

## Resolution

Default 1080p (1920×1080). `--res=1440` renders 2560×1440 on both scripts — same 1280×720 layout,
twice the pixel density, same frame rate — written with a `_1440` suffix (`colvio_explorer_en_1440.mp4`,
`colvio_tour_en_1440.mp4`, `clips_en_1440/`, `summary_1440.json`) so the 1080p files are never overwritten.
Use 1440p for YouTube: it gets YouTube's higher-quality encodes, so UI text stays sharp even when watched
in 1080p. Files are about 40 % bigger.

## Music (optional)

Both scripts take `--music=<file>`: the track loops under the whole video at low volume, fades in
over 1.5 s and out over the last 2.5 s (clips cut from the tour inherit it). Use a track whose
licence allows commercial use without attribution in the video (e.g. Pixabay Music, or a YouTube
Audio Library track marked "no attribution required") — the licence is yours to check. Drop it in
`tools/video/music/` (git-ignored):

```bash
node make-video.mjs --music=music/track.mp3
node make-deep.mjs --module=explorer --music=music/track.mp3
```

Most LinkedIn videos autoplay muted: the captions carry the message, the music is a bonus.

## Chrome Web Store graphics

```bash
node store-shots.mjs
```

Writes, from the demo build: `store/en/01…05_<module>.png` and `store/fr/…` (1280×800 screenshots —
headline band over a 2× capture, 24-bit PNG, full bleed), `store/promo_small_440x280.png`,
`store/marquee_1400x560.png`, and `out/linkedin/colvio_5_screens_<lang>.pdf` (the five screenshots
as a LinkedIn document post). Headlines live in `SHOTS` in the script; re-run after a UI change.

## YouTube channel art

```bash
node youtube-art.mjs   # → store/youtube_banner_2560x1440.png (text inside the 1546×423 safe area), store/youtube_avatar_800.png, store/youtube_watermark_150.png
```

## YouTube upload kit

```bash
node make-video.mjs --lang=en --no-clips   # records each scene's start in out/video/summary.json
node youtube-kit.mjs                       # → store/youtube-tour.md: title, description with chapters, tags, settings
```

YouTube chapters must start at 0:00, be at least 3 and each last 10 s or more, so scenes (~8 s) are grouped.
Re-run both after the tour changes — the timestamps move. `--res=1440` on both uses the 1440p render.

The module videos get the same treatment:

```bash
node make-deep.mjs --module=<key>[,…] --lang=en --res=1440   # writes colvio_<key>_en_1440.mp4 + .json (chapter times)
node youtube-deep.mjs                                         # every 1440p EN deep dive found (--res=1080, --module=a,b)
```

→ `out/upload/colvio_<key>_en.mp4` (the file to upload: silent stereo AAC track, moov first),
`out/upload/colvio_<key>_thumb.jpg` (1280×720, the video's title card) and `store/youtube-deep.md` (title,
description with chapters, tags, settings, playlist order).

Both kits end with an **upload pre-flight** (`youtube-check.mjs`) on the file actually uploaded and the
text pasted with it: H.264 High, yuv420p, progressive, 24–60 fps, 16:9, a stereo AAC track, moov before
mdat, ≤ 15 min (unverified channels); title 1–100 characters, description ≤ 5,000 bytes, no `<` or `>`
in either (YouTube refuses them), tags ≤ 500 characters, chapters from 0:00, at least 3, each ≥ 10 s;
thumbnail 16:9, ≥ 640 wide, ≤ 2 MB. A failure exits non-zero and names the problem.

## What's filmed

Only modules that show **real content in demo mode** (checked screenshot by screenshot): every
module except System Ops — 20 of 21.

**Not filmed**: System Ops (no system jobs, plug-in traces or flow runs in demo). The Data Loader,
Recycle Bin, API Tester and Schema demos were enriched for filming (`src/loaderDemo.js`,
`recycleBinDemo.js`, `apiDemo.js`, `schemaDemo.js`) — demo mode only, live paths untouched. So were
the Explorer's SQL and views (`explorerDemo.js`: a SELECT's own columns, order and aliases on the
demo accounts; Save as view checked like the server, related tables included), N:N associations
(`associationDemo.js`: users by email, teams by name, links already there), a web-resource version
conflict (`webResourcesDemo.js`: a colleague's save lands before your first save of
`new_/scripts/opportunity.js`) and the Health check on production (`demoProduction.js`, opt-in).

## Notes

- The app UI stays in English in both videos (most of the UI is English); captions follow the
  language. Captions only — no voice-over (the Windows voices are too robotic), no music.
- Demo data only: no real organization ever appears on screen.
- Each run replays every filmed module: a scene whose action fails, or any console error, makes the
  script exit non-zero — it doubles as an end-to-end smoke test of the demo build.
