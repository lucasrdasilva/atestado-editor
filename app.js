// Atestado editor — browser entrypoint. Loads pdf-lib from a CDN and delegates
// all the heavy lifting to pdf-editor.mjs (shared with the Node test script).

import * as pdfLib from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
import {
  computeCurrentPeriod,
  formatFooterTimestamp,
  validateDateString,
  generateAtestado,
} from "./pdf-editor.mjs";

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------

function triggerDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function autoFormatDateInput(input) {
  // Lightweight mask: digits only, inserts slashes at positions 2 and 4.
  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    input.value = formatted;
  });
}

async function fetchBasePdf() {
  const res = await fetch("assets/AtestadoMatricula.pdf");
  if (!res.ok) throw new Error(`Falha ao carregar o PDF base: HTTP ${res.status}`);
  return res.arrayBuffer();
}

function init() {
  const form = document.getElementById("form");
  const startInput = document.getElementById("startDate");
  const endInput = document.getElementById("endDate");
  const periodPreview = document.getElementById("periodPreview");
  const timestampPreview = document.getElementById("timestampPreview");
  const statusEl = document.getElementById("status");
  const generateBtn = document.getElementById("generateBtn");

  autoFormatDateInput(startInput);
  autoFormatDateInput(endInput);

  // Keep the previews live so the user knows what will be stamped in.
  const refreshPreviews = () => {
    const now = new Date();
    periodPreview.value = computeCurrentPeriod(now);
    timestampPreview.value = formatFooterTimestamp(now);
  };
  refreshPreviews();
  setInterval(refreshPreviews, 30_000);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.className = "status";
    statusEl.textContent = "";

    try {
      const startDate = validateDateString(startInput.value, "Data de início");
      const endDate = validateDateString(endInput.value, "Data de término");

      const now = new Date();
      const period = computeCurrentPeriod(now);
      const timestamp = formatFooterTimestamp(now);

      generateBtn.disabled = true;
      statusEl.textContent = "Gerando PDF…";

      const baseBytes = await fetchBasePdf();
      const bytes = await generateAtestado(pdfLib, baseBytes, {
        startDate,
        endDate,
        period,
        timestamp,
      });

      triggerDownload(bytes, `AtestadoMatricula_${Date.now()}.pdf`);

      statusEl.className = "status success";
      statusEl.textContent = "PDF gerado e baixado.";
    } catch (err) {
      console.error(err);
      statusEl.className = "status error";
      statusEl.textContent = err.message || "Erro inesperado ao gerar o PDF.";
    } finally {
      generateBtn.disabled = false;
    }
  });
}

init();
