// YouTube channel art from the Colvio icon: banner 2560×1440 (text inside the 1546×423 area every
// device shows) and avatar 800×800 (YouTube crops it to a circle), watermark 150×150, video thumbnail 1280×720. → store/youtube_*.png
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { HERE, ffmpeg } from "./lib.mjs";

const REPO = path.resolve(HERE, "..", "..");
const OUT = path.join(REPO, "store");
const ICON = `data:image/png;base64,${fs.readFileSync(path.join(REPO, "icons", "icon512.png")).toString("base64")}`;
const BG = "radial-gradient(ellipse at 30% 20%,#123d94 0%,#0B0E14 62%)";
const BASE = `*{margin:0;box-sizing:border-box}body{overflow:hidden;background:${BG};font-family:"Segoe UI",system-ui,sans-serif;color:#fff}`;

const banner = `<html><head><style>${BASE}
  body{width:2560px;height:1440px;display:flex;align-items:center;justify-content:center}
  .safe{width:1546px;height:423px;display:flex;align-items:center;gap:56px;justify-content:center}
  img{width:220px;height:220px}
  .t{font-size:118px;font-weight:800;letter-spacing:-2px;line-height:1}
  .s{font-size:44px;color:#cfe0ff;margin-top:14px}
  .n{font-size:30px;color:#8fb0ea;margin-top:18px}
</style></head><body><div class="safe"><img src="${ICON}"><div>
  <div class="t">Colvio</div><div class="s">The free toolkit for Dynamics 365 &amp; Dataverse</div>
  <div class="n">21 modules · open source · runs in your browser</div></div></div></body></html>`;

const avatar = `<html><head><style>${BASE}
  body{width:800px;height:800px;display:flex;align-items:center;justify-content:center}
  img{width:520px;height:520px}
</style></head><body><img src="${ICON}"></body></html>`;

// Thumbnail 1280×720: the Explorer capture made by store-shots.mjs (out/store-raw/explorer.png).
const RAW = path.join(HERE, "out", "store-raw", "explorer.png");
const thumb = fs.existsSync(RAW) && `<html><head><style>${BASE}
  body{width:1280px;height:720px;position:relative}
  .txt{position:absolute;left:64px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center}
  .brand{display:flex;align-items:center;gap:18px}
  .brand img{width:92px;height:92px}
  .brand span{font-size:76px;font-weight:800;letter-spacing:-2px}
  .h{font-size:58px;font-weight:800;line-height:1.05;margin-top:26px}
  .s{font-size:28px;color:#cfe0ff;margin-top:18px}
  .shot{position:absolute;left:600px;top:96px;width:760px;border-radius:14px 0 0 14px;border:2px solid #2b4a85;border-right:none;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.7)}
  .shot img{display:block;width:100%}
</style></head><body>
  <div class="txt"><div class="brand"><img src="${ICON}"><span>Colvio</span></div>
    <div class="h">20 modules<br>in 3 minutes</div><div class="s">Free toolkit for Dynamics 365 &amp; Dataverse</div></div>
  <div class="shot"><img src="data:image/png;base64,${fs.readFileSync(RAW).toString("base64")}"></div>
</body></html>`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
const jobs = [[banner, { width: 2560, height: 1440 }, "youtube_banner_2560x1440.png"], [avatar, { width: 800, height: 800 }, "youtube_avatar_800.png"]];
if (thumb) jobs.push([thumb, { width: 1280, height: 720 }, "youtube_thumbnail_1280x720.png"]);
else console.log("(no thumbnail: run store-shots.mjs first for out/store-raw/explorer.png)");
for (const [html, size, name] of jobs) {
  await page.setViewportSize(size); await page.setContent(html); await page.waitForTimeout(200);
  const tmp = path.join(OUT, name + ".tmp.png");
  await page.screenshot({ path: tmp });
  ffmpeg(["-i", tmp, "-pix_fmt", "rgb24", path.join(OUT, name)], name);
  fs.rmSync(tmp);
}
await browser.close();
// watermark (the corner "subscribe" badge): the icon itself, transparent corners kept
ffmpeg(["-i", path.join(REPO, "icons", "icon512.png"), "-vf", "scale=150:150:flags=lanczos", "-pix_fmt", "rgba", path.join(OUT, "youtube_watermark_150.png")], "watermark");
console.log(`✓ store/youtube_banner_2560x1440.png, store/youtube_avatar_800.png, store/youtube_watermark_150.png${thumb ? ", store/youtube_thumbnail_1280x720.png" : ""}`);
