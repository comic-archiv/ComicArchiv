import {
  clearDiagnosticLog,
  collectDiagnosticReport,
  downloadDiagnosticReport,
  formatDiagnosticBytes,
  getDiagnosticLog,
  recordDiagnosticError
} from "./diagnostics.js";
import { formatDiagnosticDate } from "./app-utils.js";

export function createDiagnosticsUI({
  state,
  elements,
  lazyDom,
  appConfig,
  getOptionalAssetStatus,
  createAppFilename,
  restoreBodyModalState
}) {
  async function open() {
    lazyDom.ensure("diagnostics");
    elements.diagnosticsModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    elements.diagnosticsMessage.textContent = "";
    window.setTimeout(() => elements.closeDiagnostics.focus(), 0);
    await run();
  }

  function close() {
    if (!elements.diagnosticsModal) return;
    elements.diagnosticsModal.classList.add("hidden");
    restoreBodyModalState();
  }

  async function run() {
    if (state.diagnosticsRunning) return state.latestDiagnosticReport;
    state.diagnosticsRunning = true;
    setBusy(true);
    elements.diagnosticsMessage.textContent = "Technische Prüfung läuft …";
    elements.diagnosticsMessage.dataset.type = "info";
    try {
      const report = await collectDiagnosticReport({
        appVersion: appConfig.appVersion,
        dataFormatVersion: appConfig.dataFormatVersion,
        archiveModelVersion: appConfig.archiveModelVersion,
        optionalAssets: getOptionalAssetStatus()
      });
      state.latestDiagnosticReport = report;
      renderReport(report);
      const warningCount = report.checks.filter((check) => check.status !== "ok").length;
      elements.diagnosticsMessage.textContent = warningCount === 0
        ? "Alle Kernprüfungen wurden ohne Warnung abgeschlossen."
        : `${warningCount} Hinweis${warningCount === 1 ? "" : "e"} gefunden. Deine Sammlung wurde dabei nicht verändert.`;
      elements.diagnosticsMessage.dataset.type = warningCount === 0 ? "success" : "warning";
      return report;
    } catch (error) {
      console.error("Diagnose konnte nicht ausgeführt werden:", error);
      recordDiagnosticError(error, "Diagnose ausführen", "error");
      elements.diagnosticsMessage.textContent = `Diagnose fehlgeschlagen: ${error.message}`;
      elements.diagnosticsMessage.dataset.type = "error";
      renderErrorLog();
      return null;
    } finally {
      state.diagnosticsRunning = false;
      setBusy(false);
    }
  }

  function renderReport(report) {
    elements.diagnosticsOverview.replaceChildren();
    const comicCount = report.database?.archiveGraph?.counts?.issues ?? report.database?.stores?.comics?.count;
    const physicalCopyCount = report.database?.archiveGraph?.counts?.copies;
    const coverCount = report.database?.stores?.coverMedia?.count;
    const metadataCount = report.database?.stores?.metadataCache?.count;
    const storageLabel = report.storage?.usage === null ? "Nicht gemeldet" : `${formatDiagnosticBytes(report.storage.usage)} belegt`;
    const offlineLabel = report.serviceWorker?.controlled
      ? `Aktiv${report.serviceWorker.workerStatus?.cacheName ? ` · ${report.serviceWorker.workerStatus.cacheName}` : ""}`
      : "Noch nicht aktiv";
    [
      ["App", `v${report.appVersion}`, `${report.environment?.testMode ? "Testmodus · " : ""}Datenformat ${report.dataFormatVersion} · Archivmodell ${report.archiveModelVersion ?? "?"}`],
      ["Lokale Sammlung", Number.isFinite(comicCount) ? `${comicCount} Ausgaben` : "Nicht lesbar", Number.isFinite(physicalCopyCount) ? `${physicalCopyCount} physische Exemplare` : (Number.isFinite(coverCount) ? `${coverCount} eigene Cover` : "")],
      ["Lokaler Speicher", storageLabel, report.storage?.quota === null ? "Kontingent unbekannt" : `${formatDiagnosticBytes(report.storage.quota)} gemeldet`],
      ["Offline-Modus", offlineLabel, Number.isFinite(metadataCount) ? `${metadataCount} Metadatensätze` : ""]
    ].forEach(([label, value, detail]) => {
      const card = document.createElement("div");
      card.className = "diagnostics-summary-card";
      const labelNode = document.createElement("span"); labelNode.textContent = label;
      const valueNode = document.createElement("strong"); valueNode.textContent = value;
      const detailNode = document.createElement("small"); detailNode.textContent = detail;
      card.append(labelNode, valueNode, detailNode);
      elements.diagnosticsOverview.append(card);
    });
    elements.diagnosticsCheckList.replaceChildren();
    report.checks.forEach((check) => {
      const row = document.createElement("div"); row.className = "diagnostics-check"; row.dataset.status = check.status;
      const icon = document.createElement("span"); icon.className = "diagnostics-check-icon"; icon.setAttribute("aria-hidden", "true"); icon.textContent = check.status === "ok" ? "✓" : "!";
      const copy = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = check.label;
      const detail = document.createElement("small"); detail.textContent = check.detail;
      copy.append(title, detail); row.append(icon, copy); elements.diagnosticsCheckList.append(row);
    });
    renderErrorLog(report.recentErrors);
  }

  function renderErrorLog(entries = getDiagnosticLog()) {
    elements.diagnosticsErrorList.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p"); empty.className = "diagnostics-empty"; empty.textContent = "Keine technischen Fehlermeldungen gespeichert.";
      elements.diagnosticsErrorList.append(empty); return;
    }
    entries.slice(0, 12).forEach((entry) => {
      const item = document.createElement("article"); item.className = "diagnostics-error-item";
      const context = document.createElement("strong"); context.textContent = entry.context || "Technische Meldung";
      const message = document.createElement("span"); message.textContent = entry.message || "Unbekannter Fehler";
      const time = document.createElement("time"); time.dateTime = entry.timestamp || ""; time.textContent = formatDiagnosticDate(entry.timestamp);
      item.append(context, message, time); elements.diagnosticsErrorList.append(item);
    });
  }

  async function exportReport() {
    const report = state.latestDiagnosticReport || await run();
    if (!report) return;
    try {
      downloadDiagnosticReport(report, createAppFilename("Entenarchiv-Diagnose", "json"));
      elements.diagnosticsMessage.textContent = "Diagnosebericht wurde als JSON-Datei erstellt.";
      elements.diagnosticsMessage.dataset.type = "success";
    } catch (error) {
      recordDiagnosticError(error, "Diagnose exportieren", "error");
      elements.diagnosticsMessage.textContent = `Export fehlgeschlagen: ${error.message}`;
      elements.diagnosticsMessage.dataset.type = "error";
    }
  }

  function clear() {
    clearDiagnosticLog();
    if (state.latestDiagnosticReport) state.latestDiagnosticReport.recentErrors = [];
    renderErrorLog([]);
    elements.diagnosticsMessage.textContent = "Gespeicherte technische Meldungen wurden gelöscht.";
    elements.diagnosticsMessage.dataset.type = "success";
  }

  function setBusy(isBusy) {
    [elements.runDiagnostics, elements.exportDiagnostics, elements.clearDiagnostics, elements.openRecovery]
      .forEach((button) => { button.disabled = Boolean(isBusy); });
  }

  return { open, close, run, exportReport, clear };
}
