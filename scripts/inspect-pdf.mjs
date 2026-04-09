// Inspects a PDF to extract text lines, fonts and positions.
// Run: node scripts/inspect-pdf.mjs
//
// PDF.js emits per-glyph text items. This script groups them by baseline Y
// and by font, so we see human-readable text runs with the exact coordinates
// and fonts we need to reproduce in pdf-lib.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfPath = resolve(__dirname, "..", "assets", "AtestadoMatricula.pdf");

const data = new Uint8Array(readFileSync(pdfPath));
const pdf = await pdfjs.getDocument({ data, verbosity: 0 }).promise;

console.log(`Pages: ${pdf.numPages}`);

for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });
  console.log(`\n=== Page ${pageNum} ===`);
  console.log(`Size (pt): ${viewport.width.toFixed(2)} x ${viewport.height.toFixed(2)}`);

  const textContent = await page.getTextContent({
    includeMarkedContent: false,
    disableNormalization: true,
  });

  // Resolve font display names once, reusing commonObjs.
  const fontCache = new Map();
  const resolveFont = (fontRef) => {
    if (fontCache.has(fontRef)) return fontCache.get(fontRef);
    let displayName = fontRef;
    try {
      const fontObj = page.commonObjs.get(fontRef);
      if (fontObj?.name) displayName = fontObj.name;
    } catch {
      // fall back to the ref key
    }
    fontCache.set(fontRef, displayName);
    return displayName;
  };

  // Group items by baseline Y (PDF.js origin is bottom-left), then by
  // consecutive font runs, so we recover "real" text spans.
  const items = textContent.items
    .filter((it) => "str" in it && it.str.length > 0)
    .map((it) => {
      const [a, b, , d, e, f] = it.transform;
      return {
        str: it.str,
        x: e,
        y: f,
        width: it.width,
        height: it.height,
        fontSize: Math.hypot(a, b) || Math.abs(d),
        fontRef: it.fontName,
        fontName: resolveFont(it.fontName),
      };
    });

  // Sort top-to-bottom (high Y first), then left-to-right.
  items.sort((a, b) => (b.y - a.y) || (a.x - b.x));

  // Bucket by rounded Y (0.5pt tolerance) so items on the same baseline merge.
  const linesByY = new Map();
  for (const item of items) {
    const yKey = Math.round(item.y * 2) / 2;
    if (!linesByY.has(yKey)) linesByY.set(yKey, []);
    linesByY.get(yKey).push(item);
  }

  const lines = [...linesByY.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, lineItems]) => ({ y, items: lineItems.sort((a, b) => a.x - b.x) }));

  for (const line of lines) {
    // Collapse consecutive items with the same font into single spans.
    const spans = [];
    for (const item of line.items) {
      const last = spans[spans.length - 1];
      if (
        last &&
        last.fontRef === item.fontRef &&
        Math.abs(last.fontSize - item.fontSize) < 0.01 &&
        // Items whose next-x is within ~2pt of last end are part of the same run
        item.x <= last.xEnd + 2
      ) {
        last.str += item.str;
        last.xEnd = item.x + item.width;
      } else {
        spans.push({
          str: item.str,
          xStart: item.x,
          xEnd: item.x + item.width,
          y: item.y,
          fontSize: item.fontSize,
          fontRef: item.fontRef,
          fontName: item.fontName,
        });
      }
    }

    const fullText = spans.map((s) => s.str).join("");
    console.log(`\ny=${line.y.toFixed(2)}  "${fullText}"`);
    for (const span of spans) {
      console.log(
        `   [${span.fontRef} / ${span.fontName}  size=${span.fontSize.toFixed(
          2,
        )}]  x=${span.xStart.toFixed(2)}→${span.xEnd.toFixed(2)}  "${span.str}"`,
      );
    }
  }
}

await pdf.destroy();
