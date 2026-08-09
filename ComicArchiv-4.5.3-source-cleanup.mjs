import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = process.cwd();
const cssPath = resolve(root, "style.css");
const htmlPath = resolve(root, "index.html");
const reportPath = resolve(root, "QUALITY-SOURCE-REPORT.md");
const packagePath = resolve(root, "package.json");

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
if (packageJson.version !== "4.5.3") {
  throw new Error(`Dieser Cleanup erwartet Entenarchiv 4.5.3, gefunden wurde ${packageJson.version || "unbekannt"}.`);
}

const originalCss = await readFile(cssPath, "utf8");
const originalHtml = await readFile(htmlPath, "utf8");
const beforeCss = auditCss(originalCss);
const beforeHtml = auditHtml(originalHtml);

const { css: dedupedCss, removedRules } = removeExactDuplicateStyleRules(originalCss);
const cleanedCss = normalizeTextFile(dedupedCss);
const cleanedHtml = normalizeTextFile(originalHtml);

const afterCss = auditCss(cleanedCss);
const afterHtml = auditHtml(cleanedHtml);

assertHtmlStructureStable(beforeHtml, afterHtml);
assertCssCleanupSafe(beforeCss, afterCss, removedRules);

await writeFile(cssPath, cleanedCss, "utf8");
await writeFile(htmlPath, cleanedHtml, "utf8");
await writeFile(reportPath, createReport({ beforeCss, afterCss, beforeHtml, afterHtml, removedRules }), "utf8");

console.log(`✓ CSS: ${removedRules.length} exakt redundante Regelblöcke entfernt`);
console.log(`✓ CSS: ${formatBytes(beforeCss.bytes)} → ${formatBytes(afterCss.bytes)}`);
console.log(`✓ HTML: ${beforeHtml.elements} Elemente und ${beforeHtml.ids} IDs unverändert`);
console.log(`✓ Report: QUALITY-SOURCE-REPORT.md erstellt`);

function normalizeTextFile(source) {
  const newlineNormalized = source.replace(/\r\n?/g, "\n");
  const withoutTrailingWhitespace = newlineNormalized.replace(/[ \t]+$/gm, "");
  const compactBlankLines = withoutTrailingWhitespace.replace(/\n{3,}/g, "\n\n");
  return `${compactBlankLines.replace(/\n+$/, "")}\n`;
}

function auditHtml(source) {
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const tags = [...source.matchAll(/<([a-z][a-z0-9-]*)(?:\s|>|\/)/gi)].map((match) => match[1].toLowerCase());
  const templates = tags.filter((tag) => tag === "template").length;
  return {
    bytes: Buffer.byteLength(source),
    lines: source.split(/\r?\n/).length,
    elements: tags.length,
    ids: ids.length,
    uniqueIds: new Set(ids).size,
    templates,
    idHash: sha256(ids.sort().join("\n"))
  };
}

function assertHtmlStructureStable(before, after) {
  for (const key of ["elements", "ids", "uniqueIds", "templates", "idHash"]) {
    if (before[key] !== after[key]) {
      throw new Error(`HTML-Sicherheitscheck fehlgeschlagen: ${key} hat sich verändert (${before[key]} → ${after[key]}).`);
    }
  }
}

function auditCss(source) {
  const rules = parseStyleRules(source);
  const selectorCounts = new Map();
  const exactCounts = new Map();
  const radiusValues = new Map();

  for (const rule of rules) {
    const selectorKey = `${rule.contextKey}\u0000${canonicalTrivia(rule.selector)}`;
    selectorCounts.set(selectorKey, (selectorCounts.get(selectorKey) || 0) + 1);
    const exactKey = `${selectorKey}\u0000${canonicalTrivia(rule.body)}`;
    exactCounts.set(exactKey, (exactCounts.get(exactKey) || 0) + 1);

    for (const match of rule.body.matchAll(/\bborder-radius\s*:\s*([^;}{]+)/gi)) {
      const value = canonicalTrivia(match[1]);
      radiusValues.set(value, (radiusValues.get(value) || 0) + 1);
    }
  }

  const duplicateSelectorGroups = [...selectorCounts.values()].filter((count) => count > 1);
  const exactDuplicateGroups = [...exactCounts.values()].filter((count) => count > 1);
  const exactDuplicateExtraRules = exactDuplicateGroups.reduce((sum, count) => sum + count - 1, 0);

  return {
    bytes: Buffer.byteLength(source),
    lines: source.split(/\r?\n/).length,
    rules: rules.length,
    uniqueSelectors: selectorCounts.size,
    repeatedSelectorGroups: duplicateSelectorGroups.length,
    repeatedSelectorExtraRules: duplicateSelectorGroups.reduce((sum, count) => sum + count - 1, 0),
    exactDuplicateGroups: exactDuplicateGroups.length,
    exactDuplicateExtraRules,
    radiusValues: [...radiusValues.entries()].sort((a, b) => b[1] - a[1]),
    dedupedRuleHash: hashDedupedRuleSequence(rules)
  };
}

function assertCssCleanupSafe(before, after, removedRules) {
  if (removedRules.length !== before.exactDuplicateExtraRules) {
    throw new Error(`CSS-Sicherheitscheck fehlgeschlagen: erwartet ${before.exactDuplicateExtraRules} entfernbare exakte Duplikate, entfernt wurden ${removedRules.length}.`);
  }
  if (after.exactDuplicateExtraRules !== 0) {
    throw new Error(`CSS-Sicherheitscheck fehlgeschlagen: ${after.exactDuplicateExtraRules} exakte Duplikat-Regeln sind übrig.`);
  }
  if (before.dedupedRuleHash !== after.dedupedRuleHash) {
    throw new Error("CSS-Sicherheitscheck fehlgeschlagen: die Regelreihenfolge oder ein nicht redundanter Regelblock hat sich verändert.");
  }
  if (after.rules !== before.rules - removedRules.length) {
    throw new Error(`CSS-Sicherheitscheck fehlgeschlagen: Regelanzahl unerwartet ${before.rules} → ${after.rules}.`);
  }
  if (after.bytes > before.bytes) {
    throw new Error("CSS-Sicherheitscheck fehlgeschlagen: die bereinigte Datei ist größer geworden.");
  }
}

function removeExactDuplicateStyleRules(source) {
  const rules = parseStyleRules(source);
  const lastByExactKey = new Map();
  for (const rule of rules) {
    const key = `${rule.contextKey}\u0000${canonicalTrivia(rule.selector)}\u0000${canonicalTrivia(rule.body)}`;
    lastByExactKey.set(key, rule);
  }

  const removals = [];
  const removedRules = [];
  for (const rule of rules) {
    const key = `${rule.contextKey}\u0000${canonicalTrivia(rule.selector)}\u0000${canonicalTrivia(rule.body)}`;
    if (lastByExactKey.get(key) !== rule) {
      removals.push([rule.start, rule.end]);
      removedRules.push({ selector: canonicalTrivia(rule.selector), context: rule.contextKey || "global" });
    }
  }

  let output = source;
  removals.sort((a, b) => b[0] - a[0]);
  for (const [start, end] of removals) {
    output = `${output.slice(0, start)}${output.slice(end)}`;
  }
  return { css: output, removedRules };
}

function hashDedupedRuleSequence(rules) {
  const lastIndexByExactKey = new Map();
  rules.forEach((rule, index) => {
    const selector = canonicalTrivia(rule.selector);
    const body = canonicalTrivia(rule.body);
    const exactKey = `${rule.contextKey}\u0000${selector}\u0000${body}`;
    lastIndexByExactKey.set(exactKey, index);
  });
  const canonical = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule, index }) => {
      const selector = canonicalTrivia(rule.selector);
      const body = canonicalTrivia(rule.body);
      const exactKey = `${rule.contextKey}\u0000${selector}\u0000${body}`;
      return lastIndexByExactKey.get(exactKey) === index;
    })
    .map(({ rule }) => `${rule.contextKey}\u0000${canonicalTrivia(rule.selector)}\u0000${canonicalTrivia(rule.body)}`)
    .join("\n");
  return sha256(canonical);
}

function parseStyleRules(source) {
  const rules = [];
  parseContainer(0, source.length, []);
  return rules;

  function parseContainer(start, end, context) {
    let cursor = start;
    while (cursor < end) {
      cursor = skipTrivia(source, cursor, end);
      if (cursor >= end) break;

      const statementStart = cursor;
      const boundary = findStatementBoundary(source, cursor, end);
      if (!boundary) break;

      if (boundary.type === "semicolon") {
        cursor = boundary.index + 1;
        continue;
      }

      const openBrace = boundary.index;
      const closeBrace = findMatchingBrace(source, openBrace, end);
      if (closeBrace < 0) throw new Error(`style.css enthält eine nicht geschlossene Klammer nahe Zeichen ${openBrace}.`);

      const header = source.slice(statementStart, openBrace).trim();
      if (!header) {
        cursor = closeBrace + 1;
        continue;
      }

      if (header.startsWith("@")) {
        const atName = header.match(/^@([\w-]+)/)?.[1]?.toLowerCase() || "";
        if (["media", "supports", "container", "layer", "scope", "document"].includes(atName)) {
          parseContainer(openBrace + 1, closeBrace, [...context, canonicalTrivia(header)]);
        }
        // @keyframes, @font-face, @page, @property etc. werden absichtlich nicht angefasst.
      } else {
        const body = source.slice(openBrace + 1, closeBrace);
        if (!hasTopLevelBrace(body)) {
          rules.push({
            start: statementStart,
            end: closeBrace + 1,
            selector: header,
            body,
            contextKey: context.join(" > ")
          });
        }
      }
      cursor = closeBrace + 1;
    }
  }
}

function skipTrivia(source, start, end) {
  let i = start;
  while (i < end) {
    if (/\s/.test(source[i])) {
      i += 1;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2);
      if (close < 0) return end;
      i = close + 2;
      continue;
    }
    break;
  }
  return i;
}

function findStatementBoundary(source, start, end) {
  let quote = "";
  let escaped = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = start; i < end; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "/" && next === "*") {
      const close = source.indexOf("*/", i + 2);
      if (close < 0) return null;
      i = close + 1;
      continue;
    }
    if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (parenDepth === 0 && bracketDepth === 0 && char === "{") return { type: "brace", index: i };
    else if (parenDepth === 0 && bracketDepth === 0 && char === ";") return { type: "semicolon", index: i };
  }
  return null;
}

function findMatchingBrace(source, openBrace, end) {
  let depth = 1;
  let quote = "";
  let escaped = false;
  for (let i = openBrace + 1; i < end; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "/" && next === "*") {
      const close = source.indexOf("*/", i + 2);
      if (close < 0) return -1;
      i = close + 1;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function hasTopLevelBrace(body) {
  let quote = "";
  let escaped = false;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    const next = body[i + 1];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "/" && next === "*") {
      const close = body.indexOf("*/", i + 2);
      if (close < 0) return true;
      i = close + 1;
      continue;
    }
    if (char === "{") return true;
  }
  return false;
}

function canonicalTrivia(value) {
  let output = "";
  let quote = "";
  let escaped = false;
  let pendingSpace = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const next = value[i + 1];
    if (quote) {
      if (pendingSpace) {
        output += " ";
        pendingSpace = false;
      }
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      if (pendingSpace && output) output += " ";
      pendingSpace = false;
      quote = char;
      output += char;
      continue;
    }
    if (char === "/" && next === "*") {
      const close = value.indexOf("*/", i + 2);
      if (close < 0) break;
      pendingSpace = true;
      i = close + 1;
      continue;
    }
    if (/\s/.test(char)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && output) output += " ";
    pendingSpace = false;
    output += char;
  }
  return output.trim();
}

function createReport({ beforeCss, afterCss, beforeHtml, afterHtml, removedRules }) {
  const topRadius = beforeCss.radiusValues.slice(0, 12);
  const removedPreview = removedRules.slice(0, 30);
  return `# Entenarchiv Source-Hygiene Report\n\n` +
    `Stand: 4.5.3 · automatisch erzeugt beim CSS/HTML Source Cleanup.\n\n` +
    `## CSS\n\n` +
    `| Kennzahl | Vorher | Nachher |\n|---|---:|---:|\n` +
    `| Dateigröße | ${formatBytes(beforeCss.bytes)} | ${formatBytes(afterCss.bytes)} |\n` +
    `| Zeilen | ${beforeCss.lines} | ${afterCss.lines} |\n` +
    `| analysierte Style-Regeln | ${beforeCss.rules} | ${afterCss.rules} |\n` +
    `| eindeutige Selektoren je Kontext | ${beforeCss.uniqueSelectors} | ${afterCss.uniqueSelectors} |\n` +
    `| wiederholte Selektorgruppen | ${beforeCss.repeatedSelectorGroups} | ${afterCss.repeatedSelectorGroups} |\n` +
    `| zusätzliche Selektor-Regelblöcke | ${beforeCss.repeatedSelectorExtraRules} | ${afterCss.repeatedSelectorExtraRules} |\n` +
    `| exakt redundante Regelblöcke | ${beforeCss.exactDuplicateExtraRules} | ${afterCss.exactDuplicateExtraRules} |\n\n` +
    `Entfernt wurden ausschließlich **vollständig identische Regelblöcke desselben Selektors im selben At-Rule-Kontext**. Der jeweils letzte Block bleibt erhalten. Abweichende Overrides werden bewusst nicht automatisch zusammengeführt.\n\n` +
    `### Häufigste border-radius-Werte\n\n` +
    (topRadius.length ? topRadius.map(([value, count]) => `- \`${value}\`: ${count}×`).join("\n") : "- keine gefunden") +
    `\n\n### Entfernte exakte Duplikate\n\n` +
    (removedPreview.length ? removedPreview.map(({ selector, context }) => `- \`${selector}\` · ${context}`).join("\n") : "- keine exakten Duplikate vorhanden") +
    (removedRules.length > removedPreview.length ? `\n- … und ${removedRules.length - removedPreview.length} weitere` : "") +
    `\n\n## HTML\n\n` +
    `| Kennzahl | Vorher | Nachher |\n|---|---:|---:|\n` +
    `| Dateigröße | ${formatBytes(beforeHtml.bytes)} | ${formatBytes(afterHtml.bytes)} |\n` +
    `| Zeilen | ${beforeHtml.lines} | ${afterHtml.lines} |\n` +
    `| Elemente | ${beforeHtml.elements} | ${afterHtml.elements} |\n` +
    `| IDs | ${beforeHtml.ids} | ${afterHtml.ids} |\n` +
    `| eindeutige IDs | ${beforeHtml.uniqueIds} | ${afterHtml.uniqueIds} |\n` +
    `| Templates | ${beforeHtml.templates} | ${afterHtml.templates} |\n\n` +
    `HTML wurde in dieser sicheren Tranche nur hinsichtlich Zeilenenden, trailing whitespace und mehrfachen Leerzeilen normalisiert. DOM-Struktur und IDs bleiben byte-unabhängig identisch.\n\n` +
    `## Nächster Schritt\n\n` +
    `Der Report dient als belastbare Basis für Tranche 2B: gezielte Konsolidierung **abweichender** CSS-Overrides und Lazy-Mounting seltener Unterseiten/Modals. Diese Änderungen benötigen visuelle Smoke-Tests und werden deshalb bewusst nicht automatisch mit 2A vermischt.\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
