// Shared building blocks for the Colvio Word documents (docx-js).
// Mini-markdown in strings: **bold**, `code`. Colors echo the Colvio palette.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  Header, Footer, AlignmentType, LevelFormat, TableOfContents, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
} = require("docx");

const VI = "5B3FD6", CY = "0E7490", INK = "172B4D", MUT = "6B778C", HEAD_BG = "EEEAFB", ALT_BG = "F7F8FA";
const IMG = (name) => path.join(__dirname, "img", name);

// "text **bold** and `code`" → TextRun[]
function runs(s, base = {}) {
  const out = [];
  const parts = String(s).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  for (const p of parts) {
    if (p.startsWith("**")) out.push(new TextRun({ text: p.slice(2, -2), bold: true, ...base }));
    else if (p.startsWith("`")) out.push(new TextRun({ text: p.slice(1, -1), font: "Consolas", size: 19, color: CY, ...base }));
    else out.push(new TextRun({ text: p, ...base }));
  }
  return out;
}

const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const p = (s, opts = {}) => new Paragraph({ spacing: { after: 120 }, children: runs(s), ...opts });
const note = (s) => new Paragraph({
  spacing: { after: 120 }, shading: { fill: ALT_BG, type: ShadingType.CLEAR },
  border: { left: { style: BorderStyle.SINGLE, size: 16, color: VI, space: 4 } },
  children: runs(s, { color: MUT, size: 20 }),
});
const bullet = (s) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: runs(s) });
const bullets = (arr) => arr.map(bullet);
const num = (s) => new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 60 }, children: runs(s) });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

// Full-width table from [header[], ...rows[][]]; col widths proportional weights.
function table(headerRow, rows, weights) {
  const TOTAL = 9026; // A4 content width
  const w = weights || headerRow.map(() => 1);
  const sum = w.reduce((a, b) => a + b, 0);
  const colW = w.map(x => Math.floor(TOTAL * x / sum));
  colW[colW.length - 1] += TOTAL - colW.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 1, color: "C9CED6" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (txt, i, head, shade) => new TableCell({
    borders, width: { size: colW[i], type: WidthType.DXA },
    shading: { fill: head ? HEAD_BG : (shade ? ALT_BG : "FFFFFF"), type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    children: [new Paragraph({ children: runs(txt, head ? { bold: true, size: 20 } : { size: 20 }) })],
  });
  return new Table({
    width: { size: TOTAL, type: WidthType.DXA }, columnWidths: colW,
    rows: [
      new TableRow({ tableHeader: true, children: headerRow.map((c, i) => cell(c, i, true, false)) }),
      ...rows.map((r, ri) => new TableRow({ children: r.map((c, i) => cell(c, i, false, ri % 2 === 1)) })),
    ],
  });
}

// Centered image scaled to a given width in pixels-at-96dpi (docx-js points).
function img(name, widthPx, alt) {
  const file = IMG(name);
  const { width, height } = pngSize(file);
  const h = Math.round(widthPx * height / width);
  return new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 120, after: 160 },
    children: [new ImageRun({
      type: "png", data: fs.readFileSync(file),
      transformation: { width: widthPx, height: h },
      altText: { title: alt, description: alt, name },
    })],
  });
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function coverAndToc({ title, subtitle, version, date, tocTitle }) {
  return [
    new Paragraph({ spacing: { before: 2800 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Colvio", bold: true, size: 72, color: VI })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160 }, children: [new TextRun({ text: title, bold: true, size: 40, color: INK })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [new TextRun({ text: subtitle, size: 26, color: MUT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [new TextRun({ text: `${version}  ·  ${date}`, size: 22, color: MUT })] }),
    pageBreak(),
    new Paragraph({ children: [new TextRun({ text: tocTitle, bold: true, size: 30 })], spacing: { after: 200 } }),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
    pageBreak(),
  ];
}

function buildDoc({ title, footerText, children }) {
  return new Document({
    creator: "Colvio", title,
    styles: {
      default: { document: { run: { font: "Arial", size: 21, color: INK } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 32, bold: true, font: "Arial", color: VI },
          paragraph: { spacing: { before: 320, after: 180 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 26, bold: true, font: "Arial", color: INK },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 22, bold: true, font: "Arial", color: CY },
          paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [
        { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
        { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, right: 1440, bottom: 1300, left: 1440 } } },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D9DCE1", space: 4 } },
        children: [new TextRun({ text: `${footerText}  —  `, size: 17, color: MUT }), new TextRun({ children: [PageNumber.CURRENT], size: 17, color: MUT })],
      })] }) },
      children,
    }],
  });
}

async function writeDoc(doc, outName) {
  const buf = await Packer.toBuffer(doc);
  const out = path.join(__dirname, "..", outName);
  fs.writeFileSync(out, buf);
  console.log("wrote", outName, Math.round(buf.length / 1024) + " KB");
}

module.exports = { h1, h2, h3, p, note, bullet, bullets, num, pageBreak, table, img, coverAndToc, buildDoc, writeDoc };
