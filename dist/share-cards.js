const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

export const SHARE_CARD_TEMPLATES = Object.freeze([
  Object.freeze({ id: "collection", label: "Meine Sammlung" }),
  Object.freeze({ id: "main-series", label: "Hauptreihe" }),
  Object.freeze({ id: "milestone", label: "Meilenstein" }),
  Object.freeze({ id: "dna", label: "Sammlungs-DNA" })
]);

export function buildShareCardPayload(template, context = {}) {
  const dna = context.dna || {};
  const main = context.mainProgress || null;
  const milestone = context.milestone || null;
  const totalSeries = Number(context.totalSeries || dna.series?.length || 0);
  const totalMissing = Number(context.totalMissing || 0);
  const generatedAt = context.generatedAt instanceof Date ? context.generatedAt : new Date();

  if (template === "main-series") {
    const percentage = main ? Number(main.percentage || 0) : 0;
    return {
      template,
      sectionLabel: "Lustiges Taschenbuch",
      headline: main ? `${formatNumber(main.presentWithinTarget)} / ${formatNumber(main.target)}` : "Noch kein Ziel",
      subline: main ? `${formatPercent(percentage)} vollständig` : "Lege zuerst ein Sammlungsziel für die Hauptreihe fest.",
      stats: main ? [
        { value: formatNumber(main.presentWithinTarget), label: "vorhanden" },
        { value: formatNumber(main.missing), label: "fehlen" },
        { value: formatNumber(main.target), label: "Zielbände" },
        { value: formatPercent(percentage), label: "Fortschritt" }
      ] : [],
      note: "Meine LTB-Sammlung",
      progress: percentage,
      generatedAt
    };
  }

  if (template === "milestone") {
    return {
      template,
      sectionLabel: milestone?.eyebrow || "Meilenstein",
      headline: milestone?.title || "Noch kein Meilenstein",
      subline: milestone?.copy || "Mit deiner Sammlung entstehen hier automatisch Meilensteine.",
      stats: [
        { value: formatNumber(dna.physicalCopies || 0), label: "Bücher" },
        { value: formatNumber(dna.uniqueIssues || 0), label: "Ausgaben" },
        { value: formatNumber(dna.completedSeries || 0), label: "Reihen komplett" },
        { value: milestone?.value != null ? formatNumber(milestone.value) : "–", label: milestone?.type === "progress" ? "Prozentmarke" : "Meilenstein" }
      ],
      note: "Aus meinem Entenarchiv",
      progress: milestone?.type === "progress" ? Number(milestone.value || 0) : null,
      generatedAt
    };
  }

  if (template === "dna") {
    const strongestYear = dna.strongestYear || null;
    const bestQuality = dna.bestQualitySeries || null;
    return {
      template,
      sectionLabel: "Sammlungs-DNA",
      headline: strongestYear ? String(strongestYear.year) : "Dein Archiv",
      subline: strongestYear ? `Mein stärkster Jahrgang mit ${formatNumber(strongestYear.copies)} Büchern.` : "Noch nicht genug Jahresdaten für eine Zeitreise.",
      stats: [
        { value: formatNumber(dna.physicalCopies || 0), label: "Bücher" },
        { value: formatNumber(dna.uniqueIssues || 0), label: "Ausgaben" },
        { value: bestQuality ? `${Math.round(bestQuality.qualityRate)} %` : "–", label: "Top-Qualität" },
        { value: formatNumber(dna.extraCopies || 0), label: "Extra-Exemplare" }
      ],
      note: bestQuality ? `Beste Qualitätsquote: ${bestQuality.series}` : "Entenarchiv",
      generatedAt
    };
  }

  return {
    template: "collection",
    sectionLabel: "Meine Sammlung",
    headline: `${formatNumber(dna.physicalCopies || 0)} Bücher`,
    subline: `${formatNumber(dna.uniqueIssues || 0)} unterschiedliche Ausgaben im Entenarchiv.`,
    stats: [
      { value: formatNumber(totalSeries), label: "Reihen" },
      { value: formatNumber(dna.uniqueIssues || 0), label: "Ausgaben" },
      { value: formatNumber(totalMissing), label: "fehlen" },
      { value: formatNumber(dna.extraCopies || 0), label: "Extra-Exemplare" }
    ],
    note: "Privates Comicarchiv",
    generatedAt
  };
}

export async function renderShareCard(canvas, payload, { iconUrl = "./icons/icon-192.png" } = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Die Share-Card-Vorschau ist nicht verfügbar.");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Die Share Card konnte nicht gezeichnet werden.");

  const colors = {
    paper: "#F7F4EE",
    paperRaised: "#FFFDF8",
    navy: "#0B1020",
    blue: "#005EA8",
    blueSoft: "#E8F2FA",
    yellow: "#EFB423",
    yellowSoft: "#FFF1BF",
    green: "#16834A",
    muted: "#657083",
    line: "#D7D0C4"
  };

  context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  context.fillStyle = colors.blue;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  drawBlueTexture(context);

  const icon = await loadImage(iconUrl).catch(() => null);
  if (icon) drawRoundedImage(context, icon, 72, 54, 98, 98, 24);

  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  context.fillStyle = "#FFFFFF";
  context.font = "800 39px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  context.fillText("ENTENARCHIV", 192, 102);
  context.fillStyle = "rgba(255,255,255,0.76)";
  context.font = "700 21px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  context.fillText("SAMMLUNGSKARTE", 192, 137);

  context.textAlign = "right";
  context.fillStyle = "rgba(255,255,255,0.78)";
  context.font = "700 21px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  context.fillText(formatDate(payload.generatedAt).toUpperCase(), 1008, 105);
  context.textAlign = "left";

  const cardX = 54;
  const cardY = 182;
  const cardW = 972;
  const cardH = 1070;
  fillRoundedRect(context, cardX, cardY, cardW, cardH, 42, colors.paper);

  context.fillStyle = colors.blue;
  context.font = "800 25px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  context.fillText(String(payload.sectionLabel || "Meine Sammlung").toUpperCase(), 108, 258);
  fillRoundedRect(context, 108, 286, 116, 10, 5, colors.yellow);

  const headline = String(payload.headline || "Entenarchiv");
  const longHeadline = headline.length > 22;
  drawArchiveMotif(context, payload, colors, {
    x: longHeadline ? 790 : 704,
    y: 318,
    width: longHeadline ? 150 : 250,
    height: longHeadline ? 190 : 278,
    quiet: longHeadline
  });

  context.fillStyle = colors.navy;
  context.font = getHeadlineFont(headline);
  const headlineWidth = longHeadline ? 760 : 570;
  const headlineLines = wrapText(context, headline, headlineWidth, 102, 2);
  let headlineY = 408;
  headlineLines.forEach((line) => {
    context.fillText(line, 108, headlineY);
    headlineY += 104;
  });

  context.font = "600 32px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  context.fillStyle = colors.muted;
  const sublineWidth = longHeadline ? 790 : 575;
  const sublines = wrapText(context, String(payload.subline || ""), sublineWidth, 44, 3);
  let sublineY = Math.max(548, headlineY + 8);
  sublines.forEach((line) => {
    context.fillText(line, 108, sublineY);
    sublineY += 44;
  });

  if (Number.isFinite(Number(payload.progress))) {
    const progressY = Math.min(672, sublineY + 22);
    fillRoundedRect(context, 108, progressY, 560, 18, 9, colors.blueSoft);
    const progressWidth = Math.max(0, Math.min(560, 560 * Number(payload.progress) / 100));
    if (progressWidth > 0) fillRoundedRect(context, 108, progressY, progressWidth, 18, 9, colors.yellow);
  }

  const stats = normalizeStats(payload.stats);
  drawStatsGrid(context, stats, { x: 108, y: 724, width: 864, colors });

  const footerTop = 1072;
  context.strokeStyle = colors.line;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(108, footerTop);
  context.lineTo(972, footerTop);
  context.stroke();

  context.fillStyle = colors.navy;
  context.font = "800 25px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  const noteLines = wrapText(context, String(payload.note || "Entenarchiv"), 650, 34, 2);
  noteLines.forEach((line, index) => context.fillText(line, 108, 1123 + index * 34));

  context.fillStyle = colors.muted;
  context.font = "600 20px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  context.fillText("Erstellt mit Entenarchiv", 108, 1190);

  if (icon) context.drawImage(icon, 876, 1096, 82, 82);
  fillRoundedRect(context, 54, 1290, 972, 12, 6, colors.yellow);
  return canvas;
}

function drawArchiveMotif(context, payload, colors, { x, y, width, height, quiet = false }) {
  context.save();
  context.globalAlpha = quiet ? 0.28 : 1;
  fillRoundedRect(context, x, y, width, height, Math.min(32, width * 0.12), quiet ? colors.blueSoft : colors.paperRaised);

  const pad = width * 0.09;
  const shelfY = y + height * 0.79;
  const available = width - pad * 2;
  const gap = Math.max(5, width * 0.025);
  const bookW = (available - gap * 3) / 4;
  const heights = [0.57, 0.69, 0.62, 0.76];
  const fills = [colors.blue, colors.yellow, colors.navy, colors.blue];
  const labels = payload.template === "main-series" ? ["1", "2", "3", "4"] : payload.template === "dna" ? ["97", "98", "99", "00"] : ["LTB", "S", "P", "+"];

  heights.forEach((ratio, index) => {
    const bookH = height * ratio;
    const bookX = x + pad + index * (bookW + gap);
    const bookY = shelfY - bookH;
    fillRoundedRect(context, bookX, bookY, bookW, bookH, Math.max(4, bookW * 0.12), fills[index]);
    context.fillStyle = index === 1 ? colors.navy : "#FFFFFF";
    context.font = `800 ${Math.max(10, Math.round(bookW * 0.33))}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
    context.textAlign = "center";
    context.fillText(labels[index], bookX + bookW / 2, bookY + Math.max(18, bookW * 0.58));
    context.textAlign = "left";
  });

  context.fillStyle = colors.navy;
  fillRoundedRect(context, x + pad * 0.55, shelfY, width - pad * 1.1, Math.max(8, height * 0.035), 4, colors.navy);
  fillRoundedRect(context, x + width * 0.12, shelfY + height * 0.055, width * 0.76, Math.max(6, height * 0.026), 3, colors.yellow);

  if (payload.template === "milestone") {
    const badgeR = Math.max(21, width * 0.12);
    context.beginPath();
    context.arc(x + width * 0.76, y + height * 0.2, badgeR, 0, Math.PI * 2);
    context.fillStyle = colors.yellow;
    context.fill();
    context.fillStyle = colors.navy;
    context.font = `900 ${Math.max(18, badgeR)}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
    context.textAlign = "center";
    context.fillText("★", x + width * 0.76, y + height * 0.2 + badgeR * 0.35);
    context.textAlign = "left";
  }

  if (payload.template === "dna") {
    context.strokeStyle = colors.yellow;
    context.lineWidth = Math.max(2, width * 0.012);
    [0.22, 0.31, 0.4].forEach((ratio) => {
      context.beginPath();
      context.arc(x + width * 0.74, y + height * 0.23, width * ratio, Math.PI * 0.9, Math.PI * 1.72);
      context.stroke();
    });
  }

  context.restore();
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Die Share Card konnte nicht als PNG erzeugt werden."));
    }, "image/png", 0.95);
  });
}

function normalizeStats(stats) {
  const source = Array.isArray(stats) ? stats.slice(0, 4) : [];
  while (source.length < 4) source.push({ value: "–", label: "" });
  return source;
}

function drawStatsGrid(context, stats, { x, y, width, colors }) {
  const gap = 18;
  const cellWidth = (width - gap) / 2;
  const cellHeight = 132;
  stats.slice(0, 4).forEach((stat, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const cellX = x + column * (cellWidth + gap);
    const cellY = y + row * (cellHeight + gap);
    fillRoundedRect(context, cellX, cellY, cellWidth, cellHeight, 24, index === 0 ? colors.blueSoft : colors.paperRaised);
    context.strokeStyle = index === 0 ? "#B9D9F1" : colors.line;
    context.lineWidth = 2;
    strokeRoundedRect(context, cellX, cellY, cellWidth, cellHeight, 24);

    context.fillStyle = index === 0 ? colors.blue : colors.navy;
    context.font = "850 43px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    context.fillText(String(stat.value || "–"), cellX + 28, cellY + 56);
    context.fillStyle = colors.muted;
    context.font = "650 22px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    const labels = wrapText(context, String(stat.label || ""), cellWidth - 56, 27, 2);
    labels.forEach((line, lineIndex) => context.fillText(line, cellX + 28, cellY + 92 + lineIndex * 25));
  });
}

function drawBlueTexture(context) {
  context.save();
  context.globalAlpha = 0.09;
  context.strokeStyle = "#FFFFFF";
  context.lineWidth = 1;
  for (let x = -CARD_HEIGHT; x < CARD_WIDTH; x += 52) {
    context.beginPath();
    context.moveTo(x, CARD_HEIGHT);
    context.lineTo(x + CARD_HEIGHT, 0);
    context.stroke();
  }
  context.restore();
}

function drawRoundedImage(context, image, x, y, width, height, radius) {
  context.save();
  roundedRectPath(context, x, y, width, height, radius);
  context.clip();
  context.drawImage(image, x, y, width, height);
  context.restore();
}

function fillRoundedRect(context, x, y, width, height, radius, fillStyle) {
  context.save();
  roundedRectPath(context, x, y, width, height, radius);
  context.fillStyle = fillStyle;
  context.fill();
  context.restore();
}

function strokeRoundedRect(context, x, y, width, height, radius) {
  context.save();
  roundedRectPath(context, x, y, width, height, radius);
  context.stroke();
  context.restore();
}

function roundedRectPath(context, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function getHeadlineFont(headline) {
  if (headline.length > 28) return "850 72px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  if (headline.length > 18) return "850 84px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  return "850 102px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
}

function wrapText(context, text, maxWidth, lineHeight, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  let consumed = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      consumed += 1;
      continue;
    }
    lines.push(line);
    line = word;
    consumed += 1;
    if (lines.length >= maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (words.length > consumed && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.replace(/[\s.,;:!?-]+$/g, "")}…`;
  }
  return lines.length ? lines : [""];
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("de-DE");
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(date);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Icon konnte nicht geladen werden."));
    image.src = url;
  });
}
