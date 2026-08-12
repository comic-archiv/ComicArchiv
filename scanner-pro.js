export const SCANNER_MODES = Object.freeze({
  FAST: "fast",
  REVIEW: "review"
});

export function normalizeScannerMode(value) {
  return value === SCANNER_MODES.REVIEW ? SCANNER_MODES.REVIEW : SCANNER_MODES.FAST;
}

export class ContinuousDetectionGate {
  constructor({ releaseAfterEmptyMs = 900 } = {}) {
    this.releaseAfterEmptyMs = Math.max(250, Number(releaseAfterEmptyMs) || 900);
    this.lastSignature = "";
    this.emptySince = null;
  }

  accept(payload, now = Date.now()) {
    const signature = createDetectionSignature(payload);
    if (!signature) return false;
    this.emptySince = null;
    if (signature === this.lastSignature) return false;
    this.lastSignature = signature;
    return true;
  }

  markMainCodeVisible() {
    this.emptySince = null;
  }

  markEmpty(now = Date.now()) {
    if (!this.lastSignature) return;
    if (this.emptySince === null) {
      this.emptySince = now;
      return;
    }
    if (now - this.emptySince >= this.releaseAfterEmptyMs) {
      this.lastSignature = "";
      this.emptySince = null;
    }
  }

  reset() {
    this.lastSignature = "";
    this.emptySince = null;
  }
}

export function createDetectionSignature(payload) {
  const extension = String(payload?.extension || "").trim();
  const mainBarcode = String(payload?.mainBarcode || "").trim();
  const bandNumber = Number(payload?.bandNumber);
  if (!extension || !Number.isSafeInteger(bandNumber) || bandNumber < 1) return "";
  return `${mainBarcode || "supplement"}:${extension}:${bandNumber}`;
}

export function createScannerQueueKey(series, bandNumber) {
  const normalizedSeries = String(series || "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const parsedBand = Number(bandNumber);
  if (!normalizedSeries || !Number.isSafeInteger(parsedBand) || parsedBand < 1) return "";
  return `${normalizedSeries}::${parsedBand}`;
}

export function mergeScannerQueueItem(queue, incoming) {
  const source = Array.isArray(queue) ? queue : [];
  const key = incoming?.queueKey || createScannerQueueKey(incoming?.series, incoming?.numericBandNumber || incoming?.bandNumber);
  if (!key) return { queue: source, item: null, merged: false, addedCopies: 0 };

  const index = source.findIndex((entry) => (
    (entry.queueKey || createScannerQueueKey(entry.series, entry.numericBandNumber || entry.bandNumber)) === key
  ));
  if (index < 0) {
    const item = { ...incoming, queueKey: key };
    return { queue: [...source, item], item, merged: false, addedCopies: getCopyDrafts(item).length };
  }

  const previous = source[index];
  const incomingCopies = getCopyDrafts(incoming);
  const mergedCopies = [...getCopyDrafts(previous), ...incomingCopies];
  const incomingMetadataStatus = String(incoming?.metadataStatus || "");
  const previousMetadataStatus = String(previous?.metadataStatus || "");
  const metadataStatus = previousMetadataStatus === "found" && ["queued", "loading", ""].includes(incomingMetadataStatus)
    ? "found"
    : (incomingMetadataStatus || previousMetadataStatus);
  const item = {
    ...previous,
    ...copyDefinedFields(incoming, [
      "title",
      "publicationYear",
      "pageUrl",
      "coverUrl",
      "coverFileName",
      "coverSource",
      "lookupVersion",
      "metadataFetchedAt"
    ]),
    metadataStatus,
    queueKey: key,
    copyDrafts: mergedCopies,
    scanCount: Number(previous.scanCount || 1) + Number(incoming.scanCount || 1),
    lastDetectedAt: incoming.lastDetectedAt || previous.lastDetectedAt || null
  };
  const next = [...source];
  next[index] = item;
  return { queue: next, item, merged: true, addedCopies: incomingCopies.length };
}

export function classifyScannerResult(item = {}) {
  const copies = getCopyDrafts(item);
  const hasInvalidCopy = copies.length === 0 || copies.some((copy) => !String(copy?.condition || "").trim());
  if (hasInvalidCopy) {
    return Object.freeze({ id: "error", label: "Angaben fehlen", tone: "error", needsReview: true });
  }

  if (item.action === "skip" && item.existingComicId) {
    return Object.freeze({ id: "existing", label: "Bereits vorhanden", tone: "warning", needsReview: true });
  }

  if (item.metadataStatus === "loading" || item.metadataStatus === "queued") {
    return Object.freeze({ id: "loading", label: "Daten werden geladen", tone: "info", needsReview: false });
  }

  if (item.recognitionSource === "manual") {
    return Object.freeze({ id: "manual", label: "Manuell prüfen", tone: "warning", needsReview: true });
  }

  if (["error", "not-found", "offline"].includes(item.metadataStatus)) {
    return Object.freeze({ id: "review", label: "Bitte prüfen", tone: "warning", needsReview: true });
  }

  if (item.existingComicId && item.action === "additional-copy") {
    return Object.freeze({ id: "additional-copy", label: "Weiteres Exemplar", tone: "success", needsReview: false });
  }

  if (copies.length > 1) {
    return Object.freeze({ id: "multiple", label: `${copies.length} Exemplare`, tone: "success", needsReview: false });
  }

  if (item.metadataStatus === "found") {
    return Object.freeze({ id: "ready", label: "Sicher erkannt", tone: "success", needsReview: false });
  }

  return Object.freeze({ id: "detected", label: "Nummer erkannt", tone: "info", needsReview: false });
}

export function summarizeScannerQueue(items = [], { sessionScans = null } = {}) {
  const summary = { total: 0, scans: 0, new: 0, existing: 0, review: 0, loading: 0, skipped: 0, copies: 0 };
  (Array.isArray(items) ? items : []).forEach((item) => {
    const status = classifyScannerResult(item);
    const copies = getCopyDrafts(item);
    summary.total += 1;
    summary.scans += Number(item.scanCount || Math.max(1, copies.length));
    summary.copies += copies.length;
    if (item.existingComicId) summary.existing += 1;
    else summary.new += 1;
    if (item.action === "skip") summary.skipped += 1;
    if (status.id === "loading") summary.loading += 1;
    if (status.needsReview) summary.review += 1;
  });
  if (Number.isSafeInteger(sessionScans) && sessionScans >= summary.scans) summary.scans = sessionScans;
  return Object.freeze(summary);
}

function getCopyDrafts(item) {
  if (Array.isArray(item?.copyDrafts) && item.copyDrafts.length) {
    return item.copyDrafts.map((copy) => ({ ...copy }));
  }

  const primary = {
    condition: item?.condition || "",
    isRead: item?.isRead === true,
    isSealed: item?.isSealed === true,
    notes: typeof item?.notes === "string" ? item.notes : ""
  };
  const copies = [primary];
  if (item?.isDuplicate) {
    copies.push({
      condition: item?.duplicateCondition || item?.condition || "",
      isRead: false,
      isSealed: false,
      notes: ""
    });
  }
  return copies;
}

function copyDefinedFields(source, keys) {
  const result = {};
  keys.forEach((key) => {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") result[key] = value;
  });
  return result;
}
