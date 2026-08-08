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
    return {
      template,
      kicker: "LUSTIGES TASCHENBUCH",
      headline: main ? `${main.presentWithinTarget} / ${main.target}` : "Noch kein Ziel",
      subline: main ? `${formatPercent(main.percentage)} vollständig` : "Lege zuerst ein Sammlungsziel für die Hauptreihe fest.",
      stats: main ? [
        { value: String(main.missing), label: "fehlen" },
        { value: String(main.presentWithinTarget), label: "vorhanden" },
        { value: String(main.target), label: "Zielbände" }
      ] : [],
      note: "Meine LTB-Sammlung",
      generatedAt
    };
  }

  if (template === "milestone") {
    return {
      template,
      kicker: milestone?.eyebrow?.toUpperCase() || "MEILENSTEIN",
      headline: milestone?.title || "Noch kein Meilenstein",
      subline: milestone?.copy || "Mit deiner Sammlung entstehen hier automatisch Meilensteine.",
      stats: [],
      note: "Aus meinem Entenarchiv.",
      generatedAt
    };
  }

  if (template === "dna") {
    const strongestYear = dna.strongestYear || null;
    const bestQuality = dna.bestQualitySeries || null;
    return {
      template,
      kicker: "SAMMLUNGS-DNA",
      headline: strongestYear ? String(strongestYear.year) : "Dein Archiv",
      subline: strongestYear ? `Mein stärkster Jahrgang mit ${strongestYear.copies} Büchern.` : "Noch nicht genug Jahresdaten für eine Zeitreise.",
      stats: [
        { value: String(dna.physicalCopies || 0), label: "Bücher" },
        { value: String(dna.uniqueIssues || 0), label: "Ausgaben" },
        { value: bestQuality ? `${Math.round(bestQuality.qualityRate)} %` : "–", label: "beste Qualitätsquote" }
      ],
      note: bestQuality ? bestQuality.series : "Entenarchiv",
      generatedAt
    };
  }

  return {
    template: "collection",
    kicker: "MEINE SAMMLUNG",
    headline: `${dna.physicalCopies || 0} Bücher`,
    subline: `${dna.uniqueIssues || 0} unterschiedliche Ausgaben im Entenarchiv.`,
    stats: [
      { value: String(totalSeries), label: "Reihen" },
      { value: String(totalMissing), label: "fehlen" },
      { value: String(dna.extraCopies || 0), label: "zusätzliche Exemplare" }
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
    navy: "#0B1020",
    blue: "#005EA8",
    yellow: "#EFB423",
    green: "#16834A",
    muted: "#657083",
    line: "#C9C6BE"
  };

  context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  context.fillStyle = colors.paper;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  drawPrintTexture(context, colors.navy);

  context.fillStyle = colors.blue;
  context.fillRect(0, 0, 44, CARD_HEIGHT);
  context.fillStyle = colors.yellow;
  context.fillRect(44, 0, 18, CARD_HEIGHT);

  drawRegistrationMarks(context, colors.navy);

  context.fillStyle = colors.navy;
  context.font = "700 38px Arial, sans-serif";
  context.letterSpacing = "2px";
  context.fillText("ENTENARCHIV", 120, 130);
  context.font = "700 24px Arial, sans-serif";
  context.fillStyle = colors.blue;
  context.fillText(String(payload.kicker || "SAMMLUNG"), 120, 218);

  context.fillStyle = colors.yellow;
  context.fillRect(120, 258, 840, 12);

  const headline = String(payload.headline || "Entenarchiv");
  context.fillStyle = colors.navy;
  context.font = headline.length > 24 ? "800 88px Arial, sans-serif" : "800 118px Arial, sans-serif";
  const headlineLines = wrapText(context, headline, 840, headline.length > 24 ? 100 : 126, 3);
  let y = 390;
  headlineLines.forEach((line) => {
    context.fillText(line, 120, y);
    y += headline.length > 24 ? 100 : 126;
  });

  context.font = "500 34px Arial, sans-serif";
  context.fillStyle = colors.muted;
  y += 20;
  const sublines = wrapText(context, String(payload.subline || ""), 820, 48, 4);
  sublines.forEach((line) => {
    context.fillText(line, 120, y);
    y += 48;
  });

  const stats = Array.isArray(payload.stats) ? payload.stats.slice(0, 3) : [];
  if (stats.length) {
    const statsTop = Math.max(820, y + 46);
    context.strokeStyle = colors.line;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(120, statsTop - 34);
    context.lineTo(960, statsTop - 34);
    context.stroke();
    const cellWidth = 840 / stats.length;
    stats.forEach((stat, index) => {
      const x = 120 + index * cellWidth;
      if (index > 0) {
        context.beginPath();
        context.moveTo(x, statsTop - 18);
        context.lineTo(x, statsTop + 120);
        context.stroke();
      }
      context.fillStyle = index === 0 ? colors.blue : colors.navy;
      context.font = "800 52px Arial, sans-serif";
      context.fillText(String(stat.value || "–"), x + 18, statsTop + 34);
      context.fillStyle = colors.muted;
      context.font = "600 23px Arial, sans-serif";
      const labelLines = wrapText(context, String(stat.label || ""), cellWidth - 36, 30, 2);
      labelLines.forEach((line, lineIndex) => context.fillText(line, x + 18, statsTop + 72 + lineIndex * 28));
    });
  }

  const footerY = 1190;
  context.fillStyle = colors.navy;
  context.fillRect(120, footerY, 840, 2);
  context.font = "700 24px Arial, sans-serif";
  context.fillStyle = colors.navy;
  context.fillText(String(payload.note || "Entenarchiv"), 120, footerY + 64);
  context.font = "500 20px Arial, sans-serif";
  context.fillStyle = colors.muted;
  context.fillText(formatDate(payload.generatedAt), 120, footerY + 103);

  const icon = await loadImage(iconUrl).catch(() => null);
  if (icon) context.drawImage(icon, 866, footerY + 28, 94, 94);

  context.fillStyle = colors.green;
  context.fillRect(120, 1305, 180, 8);
  context.fillStyle = colors.yellow;
  context.fillRect(310, 1305, 110, 8);
  context.fillStyle = colors.blue;
  context.fillRect(430, 1305, 530, 8);

  return canvas;
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Die Share Card konnte nicht als PNG erzeugt werden."));
    }, "image/png", 0.95);
  });
}

function drawPrintTexture(context, color) {
  context.save();
  context.globalAlpha = 0.055;
  context.fillStyle = color;
  for (let y = 28; y < CARD_HEIGHT; y += 30) {
    for (let x = 88 + (Math.floor(y / 30) % 2) * 10; x < CARD_WIDTH; x += 30) {
      context.beginPath();
      context.arc(x, y, 1.5, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function drawRegistrationMarks(context, color) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 2;
  [[96, 82], [984, 82], [96, 1268], [984, 1268]].forEach(([x, y]) => {
    context.beginPath();
    context.moveTo(x - 11, y);
    context.lineTo(x + 11, y);
    context.moveTo(x, y - 11);
    context.lineTo(x, y + 11);
    context.stroke();
  });
  context.restore();
}

function wrapText(context, text, maxWidth, lineHeight, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length >= maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (words.length && lines.length === maxLines) {
    const reconstructed = lines.join(" ");
    if (reconstructed.length < text.length) {
      let last = lines[lines.length - 1];
      while (last.length > 1 && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      lines[lines.length - 1] = `${last.replace(/[\s.,;:!?-]+$/g, "")}…`;
    }
  }
  return lines.length ? lines : [""];
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
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
