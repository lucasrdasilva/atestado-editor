// Test harness: runs the shared pdf-editor logic in Node to produce a sample
// PDF, then re-inspects it so we can eyeball that the replacement text is in
// the right positions and fonts.
//
// Run: node scripts/test-gen.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as pdfLib from "pdf-lib";

import {
  generateAtestado,
  computeCurrentPeriod,
  formatFooterTimestamp,
} from "../pdf-editor.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const basePath = resolve(__dirname, "..", "assets", "AtestadoMatricula.pdf");
const outPath = resolve(__dirname, "..", "assets", "AtestadoMatricula.test.pdf");

const baseBytes = readFileSync(basePath);
const now = new Date();

const bytes = await generateAtestado(pdfLib, baseBytes, {
  name: "Lucas Roberto da Silva",
  ufscarNumber: "760929",
  startDate: "07/11/2024",
  endDate: "08/01/2027",
  period: computeCurrentPeriod(now),
  timestamp: formatFooterTimestamp(now),
});

writeFileSync(outPath, bytes);
console.log(`Wrote ${outPath} (${bytes.length} bytes)`);

// Re-inspect the generated PDF so we can see the new text structure.
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const pdf = await pdfjs.getDocument({
  data: new Uint8Array(readFileSync(outPath)),
  verbosity: 0,
}).promise;

const page = await pdf.getPage(1);
const textContent = await page.getTextContent({
  includeMarkedContent: false,
  disableNormalization: true,
});

// Focus on the three lines we changed.
const targets = [650.13, 615.5, 100.62];
const tolerance = 3;

for (const targetY of targets) {
  const itemsOnLine = textContent.items
    .filter((it) => "str" in it && Math.abs(it.transform[5] - targetY) <= tolerance)
    .sort((a, b) => a.transform[4] - b.transform[4]);
  const reconstructed = itemsOnLine.map((it) => it.str).join("");
  console.log(`\ny≈${targetY}:`);
  console.log(`  items: ${itemsOnLine.length}`);
  console.log(`  text : "${reconstructed}"`);
}

await pdf.destroy();
