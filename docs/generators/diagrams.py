# Generates the diagram PNGs embedded in the Colvio Word/PowerPoint docs.
# Style: light background (print-friendly), Colvio violet/cyan accents, 200 dpi.
# Run: python diagrams.py   (outputs into ./img/)
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "img")
os.makedirs(OUT, exist_ok=True)

VI = "#7c5cff"   # violet
CY = "#00b8d9"   # cyan
GN = "#36b37e"   # green
OR = "#ff8b00"   # orange
RD = "#de350b"   # red
INK = "#172b4d"  # dark text
MUT = "#6b778c"  # muted text
BG2 = "#f4f5f7"  # light surface

plt.rcParams.update({"font.family": "DejaVu Sans", "text.color": INK})


def box(ax, x, y, w, h, label, sub=None, fc="white", ec=VI, lw=1.6, fs=11, subfs=8.5, bold=True):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.012,rounding_size=0.025",
                                fc=fc, ec=ec, lw=lw, mutation_aspect=1))
    cy_ = y + h / 2
    if sub:
        ax.text(x + w / 2, cy_ + h * 0.16, label, ha="center", va="center",
                fontsize=fs, fontweight="bold" if bold else "normal", color=INK)
        ax.text(x + w / 2, cy_ - h * 0.20, sub, ha="center", va="center", fontsize=subfs, color=MUT)
    else:
        ax.text(x + w / 2, cy_, label, ha="center", va="center",
                fontsize=fs, fontweight="bold" if bold else "normal", color=INK)


def arrow(ax, x1, y1, x2, y2, color=MUT, lw=1.6, style="-|>", label=None, loff=(0, 0.02), fs=8.5):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=14,
                                 color=color, lw=lw, shrinkA=2, shrinkB=2))
    if label:
        ax.text((x1 + x2) / 2 + loff[0], (y1 + y2) / 2 + loff[1], label,
                ha="center", va="bottom", fontsize=fs, color=MUT)


def new_fig(w, h):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")
    return fig, ax


def save(fig, name):
    fig.savefig(os.path.join(OUT, name), dpi=200, bbox_inches="tight",
                facecolor="white", pad_inches=0.12)
    plt.close(fig)
    print("wrote", name)


# ── 1. Architecture ────────────────────────────────────────────────────────
def d_architecture():
    fig, ax = new_fig(10, 4.4)
    ax.text(0.5, 0.96, "Colvio — Architecture (Manifest V3)", ha="center", fontsize=13.5, fontweight="bold")
    box(ax, 0.01, 0.38, 0.215, 0.32, "Panel (React 18)", "panel.html — own tab\n12 modules", ec=VI, fs=10.5, subfs=8)
    box(ax, 0.295, 0.38, 0.175, 0.32, "Service worker", "background.js\nmessage relay", ec=CY, fs=10.5, subfs=8)
    box(ax, 0.54, 0.38, 0.20, 0.32, "Content script", "content.js · *.dynamics.com\n42 actions · validation", ec=CY, fs=10.5, subfs=8)
    box(ax, 0.81, 0.38, 0.18, 0.32, "Dataverse", "Web API v9.2\nOData · $batch", ec=GN, fs=10.5, subfs=8)
    # labels above the box row — the gaps between boxes are narrower than the text
    arrow(ax, 0.225, 0.54, 0.295, 0.54); ax.text(0.26, 0.745, "runtime\nmessage", ha="center", va="bottom", fontsize=7.8, color=MUT)
    arrow(ax, 0.47, 0.54, 0.54, 0.54);  ax.text(0.505, 0.745, "tabs\nmessage", ha="center", va="bottom", fontsize=7.8, color=MUT)
    arrow(ax, 0.74, 0.54, 0.81, 0.54);  ax.text(0.775, 0.745, "fetch\n(cookies)", ha="center", va="bottom", fontsize=7.8, color=MUT)
    box(ax, 0.01, 0.04, 0.215, 0.22, "chrome.storage.local", "metadata cache (org TTL)\nhistory · templates (redacted)",
        ec=MUT, fs=9, subfs=7.6)
    arrow(ax, 0.115, 0.26, 0.115, 0.38, color=MUT, lw=1.2)
    ax.text(0.62, 0.16, "Zero external egress: every request targets the user's own org.\n"
                        "No analytics, no telemetry, no third-party servers.",
            ha="center", fontsize=9.5, color=MUT,
            bbox=dict(boxstyle="round,pad=0.5", fc=BG2, ec="none"))
    save(fig, "architecture.png")


# ── 2. Loader wizard ───────────────────────────────────────────────────────
def d_wizard():
    fig, ax = new_fig(10, 2.6)
    ax.text(0.5, 0.92, "Data Loader — 5-step wizard", ha="center", fontsize=13.5, fontweight="bold")
    steps = [("1. Source", "CSV / Excel / paste\nRFC-4180 parser"),
             ("2. Mapping", "auto-map columns\ntransforms · templates"),
             ("3. Lookups", "parents @odata.bind\nalt-key direct"),
             ("4. Preview", "pre-flight checks\nbatch × threads"),
             ("5. Run", "live per-row log\ncancel anytime")]
    w, gap = 0.165, 0.037
    x = 0.013  # inset so the rounded borders of the first/last boxes aren't clipped
    for i, (t, s) in enumerate(steps):
        box(ax, x, 0.22, w, 0.42, t, s, ec=VI if i != 4 else GN, fs=10.5, subfs=8)
        if i < 4:
            arrow(ax, x + w, 0.43, x + w + gap, 0.43)
        x += w + gap
    save(fig, "wizard.png")


# ── 3. Four import modes ───────────────────────────────────────────────────
def d_modes():
    fig, ax = new_fig(10, 4.6)
    ax.text(0.5, 0.965, "The 4 import modes — what happens to each row", ha="center", fontsize=13.5, fontweight="bold")
    rows = [
        ("CREATE", GN, "POST /set", "always creates a new record", "—"),
        ("UPSERT", CY, "PATCH /set(key='v')", "updates the record", "creates it"),
        ("UPDATE", OR, "PATCH + If-Match: *", "updates the record", "404 — fails, nothing created"),
        ("DELETE", RD, "DELETE /set(key='v')", "deletes the record", "404 — row fails"),
    ]
    ax.text(0.55, 0.875, "record exists", ha="center", fontsize=9.5, color=MUT, fontweight="bold")
    ax.text(0.845, 0.875, "record missing", ha="center", fontsize=9.5, color=MUT, fontweight="bold")
    y = 0.70
    for name, c, req, hit, miss in rows:
        box(ax, 0.018, y, 0.115, 0.135, name, ec=c, fs=10.5)
        ax.text(0.145, y + 0.0675, req, fontsize=8.6, family="monospace", va="center", color=INK)
        ax.text(0.55, y + 0.0675, hit, fontsize=9, va="center", ha="center", color=INK)
        ax.text(0.845, y + 0.0675, miss, fontsize=9, va="center", ha="center",
                color=(RD if "fails" in miss else INK))
        y -= 0.165
    ax.text(0.5, 0.045, "Key = GUID or any single-attribute alternate key. The key addresses the record in the URL —\n"
                        "it is never duplicated in the body. UPDATE can optionally pre-verify existence for orgs that ignore If-Match on alt-keys.",
            ha="center", fontsize=9, color=MUT,
            bbox=dict(boxstyle="round,pad=0.45", fc=BG2, ec="none"))
    save(fig, "modes.png")


# ── 4. $batch anatomy ──────────────────────────────────────────────────────
def d_batch():
    fig, ax = new_fig(10, 4.2)
    ax.text(0.5, 0.96, "Bulk engine — parallel $batch with per-record changesets", ha="center",
            fontsize=13.5, fontweight="bold")
    box(ax, 0.02, 0.40, 0.17, 0.30, "Rows", "CSV 1…n\nprepared records", ec=VI)
    box(ax, 0.27, 0.62, 0.22, 0.16, "Worker 1", "chunk ≤500 records", ec=CY, fs=9.5, subfs=7.8)
    box(ax, 0.27, 0.42, 0.22, 0.16, "Worker 2…6", "parallel threads", ec=CY, fs=9.5, subfs=7.8)
    box(ax, 0.27, 0.22, 0.22, 0.16, "Worker n", "(configurable 1-10)", ec=CY, fs=9.5, subfs=7.8)
    for yy in (0.70, 0.50, 0.30):
        arrow(ax, 0.19, 0.55, 0.27, yy)
    box(ax, 0.55, 0.28, 0.30, 0.46, "$batch request", "one changeset per record\nrow 137 error ≠ rollback of 1…136\nIf-Match / MSCRM headers per op",
        ec=VI, fs=10.5, subfs=7.8)
    for yy in (0.70, 0.50, 0.30):
        arrow(ax, 0.49, yy, 0.55, 0.51)
    box(ax, 0.885, 0.40, 0.105, 0.22, "Dataverse", ec=GN, fs=10)
    arrow(ax, 0.85, 0.51, 0.885, 0.51)
    ax.text(0.87, 0.78, "429 → retry\n(Retry-After)", ha="center", va="bottom", fontsize=7.8, color=MUT)
    ax.text(0.5, 0.045, "Cancel stops new chunks, in-flight back-off retries, and remaining batches inside the content script — no writes after cancel.",
            ha="center", fontsize=9, color=MUT,
            bbox=dict(boxstyle="round,pad=0.45", fc=BG2, ec="none"))
    save(fig, "batch.png")


# ── 5. Security layers ─────────────────────────────────────────────────────
def d_security():
    fig, ax = new_fig(10, 4.6)
    ax.text(0.5, 0.96, "Defense in depth — request path safeguards", ha="center", fontsize=13.5, fontweight="bold")
    layers = [
        ("UI layer", "typed delete confirmation · pre-flight checks · admin-gated speed boosters", VI),
        ("Bridge (panel)", "30 req/s rate limit · org-scoped cache keys · secret-header redaction in saved history", VI),
        ("Content script", "entity/field regex validation · GUID format checks · control-char strip (CRLF-proof)\nsame-org URL enforcement (re-validated) · If-Match update-only · 429 back-off", CY),
        ("Dataverse (server)", "your security roles enforced — Colvio can never exceed the signed-in user's rights", GN),
    ]
    y = 0.74
    for name, desc, c in layers:
        box(ax, 0.03, y, 0.18, 0.15, name, ec=c, fs=10.5)
        ax.text(0.235, y + 0.075, desc, fontsize=9.3, va="center", color=INK)
        if y > 0.2:
            arrow(ax, 0.12, y, 0.12, y - 0.045, color=MUT, lw=1.2)
        y -= 0.195
    save(fig, "security.png")


# ── 6. Module map ──────────────────────────────────────────────────────────
def d_modules():
    fig, ax = new_fig(10, 5.6)
    ax.text(0.5, 0.965, "Colvio — 14 modules", ha="center", fontsize=13.5, fontweight="bold")
    mods = [
        ("Data Explorer", "Builder · OData · FetchXML · SQL", VI),
        ("API Tester", "Postman-style Web API client", VI),
        ("Data Loader", "CREATE · UPSERT · UPDATE · DELETE", VI),
        ("Show All Data", "fields + change history (audit)", CY),
        ("Metadata Browser", "entities · fields · OptionSets", CY),
        ("Schema (ERD)", "interactive diagram + exports", CY),
        ("Relationships", "N:1 · 1:N · N:N graph", CY),
        ("Solution Explorer", "components by type", CY),
        ("Translation Manager", "multi-language labels", CY),
        ("Users & Licenses", "CAL types · last login", GN),
        ("Security Audit", "roles · privileges · flags", GN),
        ("Login History", "audit timeline per user", GN),
        ("Recycle Bin", "restore deleted records", VI),
        ("System Ops", "system jobs / plugin traces", GN),
    ]
    cols, w, h, gx, gy = 3, 0.295, 0.135, 0.0425, 0.046
    x0, y0 = 0.015, 0.775
    for i, (t, s, c) in enumerate(mods):
        r, col = divmod(i, cols)
        box(ax, x0 + col * (w + gx), y0 - r * (h + gy), w, h, t, s, ec=c, fs=10, subfs=8)
    save(fig, "modules.png")


d_architecture(); d_wizard(); d_modes(); d_batch(); d_security(); d_modules()
print("All diagrams generated in", OUT)
