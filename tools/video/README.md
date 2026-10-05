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

- `video/colvio_tour_en.mp4`, `video/colvio_tour_fr.mp4` — intro card, 16 modules, outro card (~2 min 15 s)
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
Write the chapters, run `--probe` until every chapter passes and every screenshot shows what the
caption claims, then render. Render one module at a time (or a comma list in one run): parallel
renders compete for the CPU and the screencast drops frames.

Available (16): `explorer`, `showalldata`, `metadata`, `relationships`, `solutions`, `automation`,
`apps`, `envvars`, `translations`, `licenses`, `bu`, `security`, `teams`, `adoption`, `logins`,
`storage`. Some chapters feed the page in-memory files through Playwright's file chooser (a
solution-compare file, a schema snapshot, a translations CSV) — nothing is downloaded or read from
disk, and download buttons are only hovered.

Selectors: the Explorer's query tabs stay mounted (hidden) while another module is open — always
target visible elements (`h.vis(text)`, `>> visible=true`).

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

## What's filmed

Only modules that show **real content in demo mode** (checked screenshot by screenshot):
Data Explorer, Show All Data, Metadata, Relationships, Solutions, Automation, Apps,
Environment Variables, Translations, Users & Licenses, Business Units, Security Audit, Teams,
Adoption, Login History, Storage.

**Not filmed yet** (demo data too thin): Data Loader (needs a pasted file walked through the
wizard), Recycle Bin (empty bin), API Tester (the demo response says `"mock": true`), System Ops
(no jobs / traces / flow runs), Schema (cards have no fields in demo). Enrich their demo mocks,
re-run `recon.mjs`, then add a scene to `SCENES` in `make-video.mjs`.

## Notes

- The app UI stays in English in both videos (most of the UI is English); captions follow the
  language. Captions only — no voice-over (the Windows voices are too robotic), no music.
- Demo data only: no real organization ever appears on screen.
- Each run replays every filmed module: a scene whose action fails, or any console error, makes the
  script exit non-zero — it doubles as an end-to-end smoke test of the demo build.
