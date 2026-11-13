// YouTube upload pre-flight — everything that makes an upload fail or degrade, checked before it
// leaves the machine: the file (container, codecs, moov first, audio track, length) and the text
// (title, description, tags, chapters, thumbnail). Used by youtube-kit.mjs (tour) and
// youtube-deep.mjs (one video per module). No ffprobe needed: ffmpeg's own stream report is read.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { ffmpegPath } from "./lib.mjs";

// ffmpeg -i prints the streams on stderr (and exits 1: no output file) — that is all we need
function streams(file) {
  const r = spawnSync(ffmpegPath, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const err = r.stderr || "";
  const dur = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  return {
    seconds: dur ? (+dur[1]) * 3600 + (+dur[2]) * 60 + (+dur[3]) : NaN,
    video: (err.match(/Stream #\S+.*?: Video: (.*)/) || [])[1] || "",
    audio: (err.match(/Stream #\S+.*?: Audio: (.*)/) || [])[1] || "",
  };
}

// top-level MP4 boxes, in order (8-byte headers; size 1 = 64-bit size follows)
function topBoxes(file) {
  const fd = fs.openSync(file, "r");
  const size = fs.fstatSync(fd).size;
  const out = [];
  const h = Buffer.alloc(16);
  let pos = 0;
  try {
    while (pos + 8 <= size && out.length < 64) {
      fs.readSync(fd, h, 0, 16, pos);
      let len = h.readUInt32BE(0);
      const type = h.toString("latin1", 4, 8);
      if (len === 1) len = Number(h.readBigUInt64BE(8));
      else if (len === 0) len = size - pos;
      if (len < 8) break;
      out.push(type);
      pos += len;
    }
  } finally { fs.closeSync(fd); }
  return out;
}

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
export { mmss };

// The chapter lines of a description ("0:00 Title"), as YouTube reads them.
export function chapterLines(description) {
  return String(description).split("\n").map(l => l.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\s+(\S.*)$/)).filter(Boolean)
    .map(m => ({ at: (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]), title: m[4] }));
}

// Group timed sections into YouTube chapters: the first at 0:00, each at least `min` seconds long
// (shorter ones are merged into the previous one), the last one too.
export function groupChapters(sections, total, min = 10) {
  const out = [];
  for (const [i, s] of sections.entries()) {
    const at = i === 0 ? 0 : Math.floor(s.at);
    const cur = out[out.length - 1];
    if (cur && at - cur.at < min) cur.titles.push(s.title); else out.push({ at, titles: [s.title] });
  }
  while (out.length > 1 && Math.floor(total) - out[out.length - 1].at < min) { const last = out.pop(); out[out.length - 1].titles.push(...last.titles); }
  return out.map(c => ({ at: c.at, title: c.titles.join(" · ") }));
}

const tagChars = (tags) => tags.reduce((n, t) => n + t.length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, tags.length - 1);

// → [] when everything passes, else the list of problems (each a sentence)
export function checkUpload({ file, title, description, tags = [], thumbnail }) {
  const p = [];
  if (!fs.existsSync(file)) return [`${file}: missing`];
  const boxes = topBoxes(file);
  const mi = boxes.indexOf("moov"), di = boxes.indexOf("mdat");
  if (mi < 0 || di < 0) p.push(`not a readable MP4 (top-level boxes: ${boxes.join(", ")})`);
  else if (mi > di) p.push("moov after mdat — re-mux with -movflags +faststart (YouTube waits for the whole file before processing)");
  const s = streams(file);
  if (!/^h264 \(High\)|^h264 \(Main\)/.test(s.video)) p.push(`video codec ${s.video.split(",")[0] || "none"} — H.264 High expected`);
  if (!/yuv420p/.test(s.video)) p.push("pixel format is not yuv420p");
  if (/interlaced|top first|bottom first/.test(s.video)) p.push("interlaced video");
  const res = s.video.match(/(\d{3,5})x(\d{3,5})/);
  if (!res) p.push("no video resolution found");
  else if (Math.abs((+res[1]) / (+res[2]) - 16 / 9) > 0.01) p.push(`aspect ${res[1]}x${res[2]} is not 16:9 (YouTube adds bars)`);
  const fps = +(s.video.match(/([\d.]+) fps/) || [])[1];
  if (!(fps >= 24 && fps <= 60)) p.push(`frame rate ${fps || "unknown"} outside 24–60`);
  if (!s.audio) p.push("no audio track — YouTube accepts it but recommends one (a silent AAC track is added in the upload copy)");
  else if (!/^aac/.test(s.audio) || !/(48000|44100) Hz/.test(s.audio) || !/stereo/.test(s.audio)) p.push(`audio ${s.audio.split(",").slice(0, 3).join(",")} — AAC 48 kHz stereo expected`);
  if (!(s.seconds > 0)) p.push("duration unreadable");
  else if (s.seconds > 15 * 60) p.push("longer than 15 min — needs a verified channel");
  if (!title || [...title].length > 100) p.push(`title ${title ? [...title].length : 0} characters (1–100)`);
  if (/[<>]/.test(title || "")) p.push("title contains < or > (YouTube refuses them)");
  if (Buffer.byteLength(description || "", "utf8") > 5000) p.push(`description ${Buffer.byteLength(description, "utf8")} bytes (max 5000)`);
  if (/[<>]/.test(description || "")) p.push("description contains < or > (YouTube refuses them)");
  if (tagChars(tags) > 500) p.push(`tags ${tagChars(tags)} characters (max 500)`);
  const ch = chapterLines(description);
  if (ch.length) {
    if (ch[0].at !== 0) p.push("first chapter does not start at 0:00");
    if (ch.length < 3) p.push(`${ch.length} chapters — YouTube needs at least 3`);
    for (let i = 0; i < ch.length; i++) {
      const end = i + 1 < ch.length ? ch[i + 1].at : Math.floor(s.seconds);
      if (end - ch[i].at < 10) p.push(`chapter ${mmss(ch[i].at)} "${ch[i].title}" lasts ${end - ch[i].at} s (min 10)`);
    }
  }
  if (thumbnail) {
    if (!fs.existsSync(thumbnail)) p.push(`thumbnail ${thumbnail} missing`);
    else {
      if (fs.statSync(thumbnail).size > 2 * 1024 * 1024) p.push("thumbnail over 2 MB");
      const t = streams(thumbnail).video.match(/(\d{3,5})x(\d{3,5})/);
      if (!t || +t[1] < 640 || Math.abs((+t[1]) / (+t[2]) - 16 / 9) > 0.01) p.push(`thumbnail ${t ? `${t[1]}x${t[2]}` : "unreadable"} — 1280x720 (16:9, ≥ 640 wide) expected`);
    }
  }
  return p;
}
