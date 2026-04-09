// Core PDF editing logic — runs unchanged in the browser (pdf-lib via CDN)
// and in Node (pdf-lib from node_modules, used only for automated tests).
//
// The function is parameterised on a pdf-lib module so the caller controls
// which build is injected. All layout constants were extracted from the base
// PDF with scripts/inspect-pdf.mjs.

const STUDENT_NAME = "Lucas Roberto da Silva";
const UFSCAR_NUMBER = "760929";

const LAYOUT = {
  fontSize: 10,
  line1: {
    baselineY: 650.13,
    redraw: {
      startX: 206.8,
      coverXStart: 204,
      coverXEnd: 560,
      coverYBottom: 648.5,
      coverHeight: 13,
    },
  },
  line4: {
    baselineY: 615.5,
    redraw: {
      startX: 40,
      coverXStart: 38,
      coverXEnd: 360,
      coverYBottom: 614,
      coverHeight: 13,
    },
  },
  footer: {
    baselineY: 100.62,
    redraw: {
      startX: 40,
      coverXStart: 38,
      coverXEnd: 220,
      coverYBottom: 99,
      coverHeight: 13,
    },
  },
};

const PT_BR_MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Returns "YYYY/S" based on the current date. Jan–Jun → 1, Jul–Dec → 2. */
export function computeCurrentPeriod(now = new Date()) {
  const year = now.getFullYear();
  const semester = now.getMonth() < 6 ? 1 : 2;
  return `${year}/${semester}`;
}

/** Returns the footer-style timestamp "dd de Mês de yyyy (HH:mm)". */
export function formatFooterTimestamp(now = new Date()) {
  const day = now.getDate();
  const month = PT_BR_MONTHS[now.getMonth()];
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${day} de ${month} de ${year} (${hours}:${minutes})`;
}

/** Validates dd/MM/yyyy and returns the canonical string, or throws. */
export function validateDateString(value, fieldLabel) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    throw new Error(`${fieldLabel}: use o formato dd/MM/aaaa`);
  }
  const [, ddStr, mmStr, yyyyStr] = match;
  const dd = Number(ddStr);
  const mm = Number(mmStr);
  const yyyy = Number(yyyyStr);
  const d = new Date(yyyy, mm - 1, dd);
  if (
    d.getFullYear() !== yyyy ||
    d.getMonth() !== mm - 1 ||
    d.getDate() !== dd
  ) {
    throw new Error(`${fieldLabel}: data inválida`);
  }
  return `${ddStr}/${mmStr}/${yyyyStr}`;
}

function drawSpans(page, spans, baselineY, startX, fonts, fontSize, rgb) {
  let x = startX;
  for (const span of spans) {
    const font = span.bold ? fonts.bold : fonts.regular;
    page.drawText(span.text, {
      x,
      y: baselineY,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    x += font.widthOfTextAtSize(span.text, fontSize);
  }
}

function whiteout(page, rect, rgb) {
  page.drawRectangle({
    x: rect.coverXStart,
    y: rect.coverYBottom,
    width: rect.coverXEnd - rect.coverXStart,
    height: rect.coverHeight,
    color: rgb(1, 1, 1),
  });
}

/**
 * Produces a customised copy of the base atestado.
 *
 * @param {object} pdfLib  pdf-lib module (PDFDocument, StandardFonts, rgb).
 * @param {Uint8Array|ArrayBuffer} baseBytes  Bytes of the base PDF.
 * @param {object} params
 * @param {string} params.startDate  dd/MM/yyyy
 * @param {string} params.endDate    dd/MM/yyyy
 * @param {string} params.period     YYYY/S
 * @param {string} params.timestamp  "dd de Mês de yyyy (HH:mm)"
 * @returns {Promise<Uint8Array>} the generated PDF bytes.
 */
export async function generateAtestado(pdfLib, baseBytes, { startDate, endDate, period, timestamp }) {
  const { PDFDocument, StandardFonts, rgb } = pdfLib;

  const pdfDoc = await PDFDocument.load(baseBytes);
  const page = pdfDoc.getPages()[0];

  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };

  // --- Line 1: name + UFSCar number ---------------------------------------
  whiteout(page, LAYOUT.line1.redraw, rgb);
  drawSpans(
    page,
    [
      { text: STUDENT_NAME, bold: true },
      { text: ", Nº UFSCar ", bold: false },
      { text: UFSCAR_NUMBER, bold: true },
      { text: ", do curso de ", bold: false },
      { text: "Ciência da", bold: true },
    ],
    LAYOUT.line1.baselineY,
    LAYOUT.line1.redraw.startX,
    fonts,
    LAYOUT.fontSize,
    rgb,
  );

  // --- Line 4: period + start date + end date -----------------------------
  whiteout(page, LAYOUT.line4.redraw, rgb);
  drawSpans(
    page,
    [
      { text: "letivo de ", bold: false },
      { text: period, bold: true },
      { text: ", com início em ", bold: false },
      { text: startDate, bold: false },
      { text: " e término em ", bold: false },
      { text: `${endDate}.`, bold: false },
    ],
    LAYOUT.line4.baselineY,
    LAYOUT.line4.redraw.startX,
    fonts,
    LAYOUT.fontSize,
    rgb,
  );

  // --- Footer: generation timestamp ---------------------------------------
  whiteout(page, LAYOUT.footer.redraw, rgb);
  drawSpans(
    page,
    [{ text: timestamp, bold: false }],
    LAYOUT.footer.baselineY,
    LAYOUT.footer.redraw.startX,
    fonts,
    LAYOUT.fontSize,
    rgb,
  );

  return pdfDoc.save();
}
