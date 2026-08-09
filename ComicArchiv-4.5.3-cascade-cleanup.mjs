import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

if (process.argv.includes("--self-test")) {
  runSelfTests();
  console.log("✓ Cascade-Cleanup Selbsttests erfolgreich");
  process.exit(0);
}

const packagePath = resolve(root, "package.json");
const cssPath = resolve(root, "style.css");
const reportPath = resolve(root, "QUALITY-CASCADE-REPORT.md");

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
if (packageJson.version !== "4.5.3") {
  throw new Error(`Dieser Cleanup erwartet Entenarchiv 4.5.3, gefunden wurde ${packageJson.version || "unbekannt"}.`);
}

const originalCss = await readFile(cssPath, "utf8");
const before = auditCss(originalCss);
const beforeFingerprint = createEffectiveFingerprint(originalCss);

const result = removeShadowedIdenticalDeclarations(originalCss);
const cleanedCss = ensureFinalNewline(result.css);
const after = auditCss(cleanedCss);
const afterFingerprint = createEffectiveFingerprint(cleanedCss);

if (beforeFingerprint !== afterFingerprint) {
  throw new Error(
    "CSS-Sicherheitscheck fehlgeschlagen: Die effektiven Deklarationen eines Selektors haben sich verändert."
  );
}

if (after.bytes > before.bytes) {
  throw new Error("CSS-Sicherheitscheck fehlgeschlagen: style.css ist nach dem Cleanup größer.");
}

for (const removal of result.removed) {
  if (!removal.proof) {
    throw new Error(`Interner Sicherheitscheck fehlgeschlagen: Beleg für ${removal.selector} / ${removal.property} fehlt.`);
  }
  if (removal.value !== removal.proof.value) {
    throw new Error(`Interner Sicherheitscheck fehlgeschlagen: Wertabweichung bei ${removal.selector} / ${removal.property}.`);
  }
  if (removal.proof.important < removal.important) {
    throw new Error(`Interner Sicherheitscheck fehlgeschlagen: !important-Priorität bei ${removal.selector} / ${removal.property}.`);
  }
}

await writeFile(cssPath, cleanedCss, "utf8");
await writeFile(reportPath, createReport({ before, after, removed: result.removed }), "utf8");

console.log(`✓ CSS: ${result.removed.length} nachweislich redundante Deklarationen entfernt`);
console.log(`✓ CSS: ${formatBytes(before.bytes)} → ${formatBytes(after.bytes)}`);
console.log(`✓ Wiederholte Selektorgruppen: ${before.repeatedSelectorGroups} → ${after.repeatedSelectorGroups}`);
console.log("✓ Effektiver Selektor-/Property-Fingerprint unverändert");
console.log("✓ Report: QUALITY-CASCADE-REPORT.md erstellt");

function removeShadowedIdenticalDeclarations(source) {
  const rules = parseStyleRules(source);
  const groups = new Map();

  for (const rule of rules) {
    const key = `${rule.contextKey}\u0000${canonicalTrivia(rule.selector)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rule);
  }

  const removed = [];
  const ranges = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const laterByProperty = new Map();

    for (let ruleIndex = group.length - 1; ruleIndex >= 0; ruleIndex -= 1) {
      const rule = group[ruleIndex];
      const declarations = parseDeclarations(source, rule);

      for (const declaration of declarations) {
        const later = laterByProperty.get(declaration.property) || [];
        const proof = later.find(
          (candidate) =>
            candidate.value === declaration.value &&
            candidate.important >= declaration.important
        );

        if (proof) {
          ranges.push([declaration.start, declaration.end]);
          removed.push({
            selector: canonicalTrivia(rule.selector),
            context: rule.contextKey || "global",
            property: declaration.property,
            value: declaration.value,
            important: declaration.important,
            proof
          });
        }
      }

      for (const declaration of declarations) {
        const list = laterByProperty.get(declaration.property) || [];
        list.push({
          value: declaration.value,
          important: declaration.important,
          selector: canonicalTrivia(rule.selector),
          context: rule.contextKey || "global",
          start: declaration.start
        });
        laterByProperty.set(declaration.property, list);
      }
    }
  }

  ranges.sort((a, b) => b[0] - a[0]);

  let output = source;
  for (const [start, end] of ranges) {
    output = `${output.slice(0, start)}${output.slice(end)}`;
  }

  return { css: output, removed };
}

function auditCss(source) {
  const rules = parseStyleRules(source);
  const selectorCounts = new Map();
  let declarations = 0;

  for (const rule of rules) {
    const key = `${rule.contextKey}\u0000${canonicalTrivia(rule.selector)}`;
    selectorCounts.set(key, (selectorCounts.get(key) || 0) + 1);
    declarations += parseDeclarations(source, rule).length;
  }

  const repeated = [...selectorCounts.values()].filter((count) => count > 1);

  return {
    bytes: Buffer.byteLength(source),
    lines: source.split(/\r?\n/).length,
    rules: rules.length,
    declarations,
    uniqueSelectorContexts: selectorCounts.size,
    repeatedSelectorGroups: repeated.length,
    repeatedSelectorExtraRules: repeated.reduce((sum, count) => sum + count - 1, 0)
  };
}

function createEffectiveFingerprint(source) {
  const rules = parseStyleRules(source);
  const effective = new Map();

  for (const rule of rules) {
    const selector = canonicalTrivia(rule.selector);
    const declarations = parseDeclarations(source, rule);

    for (const declaration of declarations) {
      const key = `${rule.contextKey}\u0000${selector}\u0000${declaration.property}`;
      const previous = effective.get(key);

      if (!previous || declaration.important || !previous.important) {
        effective.set(key, {
          important: declaration.important,
          value: declaration.value
        });
      }
    }
  }

  return JSON.stringify(
    [...effective.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, value.important, value.value])
  );
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
      if (closeBrace < 0) {
        throw new Error(`style.css enthält eine nicht geschlossene Klammer nahe Zeichen ${openBrace}.`);
      }

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
      } else {
        const body = source.slice(openBrace + 1, closeBrace);
        if (!hasTopLevelBrace(body)) {
          rules.push({
            start: statementStart,
            end: closeBrace + 1,
            bodyStart: openBrace + 1,
            bodyEnd: closeBrace,
            selector: header,
            contextKey: context.join(" > ")
          });
        }
      }

      cursor = closeBrace + 1;
    }
  }
}

function parseDeclarations(source, rule) {
  const body = source.slice(rule.bodyStart, rule.bodyEnd);
  const segments = splitTopLevelDeclarationSegments(body);
  const declarations = [];

  for (const segment of segments) {
    const raw = body.slice(segment.start, segment.end);
    const colon = findTopLevelColon(raw);
    if (colon < 0) continue;

    const beforeColon = raw.slice(0, colon);
    const sanitized = replaceCommentsWithSpaces(beforeColon);
    const match = sanitized.match(/((?:--)?[-_a-zA-Z][-_a-zA-Z0-9]*)\s*$/);
    if (!match) continue;

    const property = match[1].toLowerCase();
    const propertyStartInSegment = match.index;
    const valueEnd = segment.hasSemicolon ? raw.length - 1 : raw.length;
    const rawValue = raw.slice(colon + 1, valueEnd);
    const parsedValue = parseCanonicalValue(rawValue);

    if (!parsedValue.value) continue;

    declarations.push({
      property,
      value: parsedValue.value,
      important: parsedValue.important,
      start: rule.bodyStart + segment.start + propertyStartInSegment,
      end: rule.bodyStart + segment.end
    });
  }

  return declarations;
}

function splitTopLevelDeclarationSegments(body) {
  const segments = [];
  let start = 0;
  let quote = "";
  let escaped = false;
  let parenDepth = 0;
  let bracketDepth = 0;

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
      if (close < 0) break;
      i = close + 1;
      continue;
    }

    if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === ";" && parenDepth === 0 && bracketDepth === 0) {
      segments.push({ start, end: i + 1, hasSemicolon: true });
      start = i + 1;
    }
  }

  if (start < body.length) {
    segments.push({ start, end: body.length, hasSemicolon: false });
  }

  return segments;
}

function findTopLevelColon(value) {
  let quote = "";
  let escaped = false;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const next = value[i + 1];

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
      const close = value.indexOf("*/", i + 2);
      if (close < 0) return -1;
      i = close + 1;
      continue;
    }

    if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === ":" && parenDepth === 0 && bracketDepth === 0) return i;
  }

  return -1;
}

function parseCanonicalValue(rawValue) {
  const canonical = canonicalTrivia(rawValue);
  const importantMatch = canonical.match(/^(.*?)(?:\s*!\s*important)\s*$/i);

  if (importantMatch) {
    return {
      value: canonicalTrivia(importantMatch[1]),
      important: 1
    };
  }

  return { value: canonical, important: 0 };
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

function replaceCommentsWithSpaces(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
}

function ensureFinalNewline(source) {
  return `${source.replace(/\n+$/, "")}\n`;
}

function createReport({ before, after, removed }) {
  const bySelector = new Map();

  for (const item of removed) {
    const key = `${item.context}\u0000${item.selector}`;
    const current = bySelector.get(key) || {
      context: item.context,
      selector: item.selector,
      declarations: []
    };
    current.declarations.push(`${item.property}: ${item.value}${item.important ? " !important" : ""}`);
    bySelector.set(key, current);
  }

  const groups = [...bySelector.values()]
    .sort((a, b) => b.declarations.length - a.declarations.length || a.selector.localeCompare(b.selector));

  const preview = groups.slice(0, 60);

  return `# Entenarchiv CSS Cascade Cleanup Report\n\n` +
    `Stand: 4.5.3 · Tranche 2B1.\n\n` +
    `## Ergebnis\n\n` +
    `| Kennzahl | Vorher | Nachher |\n|---|---:|---:|\n` +
    `| Dateigröße | ${formatBytes(before.bytes)} | ${formatBytes(after.bytes)} |\n` +
    `| Zeilen | ${before.lines} | ${after.lines} |\n` +
    `| Style-Regeln | ${before.rules} | ${after.rules} |\n` +
    `| Deklarationen | ${before.declarations} | ${after.declarations} |\n` +
    `| eindeutige Selektoren je Kontext | ${before.uniqueSelectorContexts} | ${after.uniqueSelectorContexts} |\n` +
    `| wiederholte Selektorgruppen | ${before.repeatedSelectorGroups} | ${after.repeatedSelectorGroups} |\n` +
    `| zusätzliche Selektor-Regelblöcke | ${before.repeatedSelectorExtraRules} | ${after.repeatedSelectorExtraRules} |\n\n` +
    `Entfernt wurden **${removed.length} Deklarationen**. Eine Deklaration wurde nur entfernt, wenn derselbe Selektor ` +
    `im exakt selben At-Rule-Kontext später dieselbe Property mit demselben Wert erneut setzt. Unterschiedliche Werte, ` +
    `Browser-Fallbacks und responsive Overrides werden nicht automatisch zusammengeführt.\n\n` +
    `Der Sicherheitscheck vergleicht zusätzlich den effektiven Selektor-/Property-Fingerprint vor und nach dem Cleanup.\n\n` +
    `## Betroffene Selektoren\n\n` +
    (preview.length
      ? preview.map((group) =>
          `- \`${group.selector}\` · ${group.context}\n` +
          group.declarations.map((declaration) => `  - \`${declaration}\``).join("\n")
        ).join("\n")
      : "- Keine nachweislich redundanten Deklarationen gefunden.") +
    (groups.length > preview.length ? `\n- … ${groups.length - preview.length} weitere Selektorgruppen im vollständigen Lauf.` : "") +
    `\n\n## Nächster Schritt\n\n` +
    `Tranche 2B2 kann auf dieser Basis gezielt DOM-Lazy-Mounting für selten genutzte Modals/Unterseiten einführen. ` +
    `Abweichende CSS-Overrides bleiben bis zu einem visuellen, selektorweisen Review unangetastet.\n`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function runSelfTests() {
  const cases = [
    {
      name: "identische spätere Deklaration wird entfernt",
      css: `.a { color: red; padding: 4px; }\n.b { color: blue; }\n.a { color: red; margin: 1px; }\n`,
      expectedRemoved: 1,
      mustContain: [".a {  padding: 4px; }", ".a { color: red; margin: 1px; }"]
    },
    {
      name: "abweichende Werte bleiben als mögliche Fallbacks stehen",
      css: `.a { color: red; }\n.a { color: color-mix(in srgb, red 90%, black); }\n`,
      expectedRemoved: 0
    },
    {
      name: "verschiedene Media-Kontexte werden nicht vermischt",
      css: `@media (min-width: 600px) { .a { gap: 8px; } }\n@media (max-width: 599px) { .a { gap: 8px; } }\n`,
      expectedRemoved: 0
    },
    {
      name: "important darf nur durch gleiche oder stärkere Priorität ersetzt werden",
      css: `.a { color: red !important; }\n.a { color: red; }\n`,
      expectedRemoved: 0
    },
    {
      name: "normale Deklaration kann durch identisches important ersetzt werden",
      css: `.a { color: red; }\n.a { color: red !important; }\n`,
      expectedRemoved: 1
    },
    {
      name: "Strings und Data-URLs bleiben parserstabil",
      css: `.a { background-image: url("data:image/svg+xml;utf8,<svg></svg>"); content: "a;b:c"; }\n.a { content: "a;b:c"; }\n`,
      expectedRemoved: 1
    },
    {
      name: "Custom Properties werden sicher behandelt",
      css: `.a { --space: 12px; }\n.a { --space: 12px; color: red; }\n`,
      expectedRemoved: 1
    },
    {
      name: "Supports-Kontext bleibt getrennt",
      css: `.a { display: grid; }\n@supports (display: grid) { .a { display: grid; } }\n`,
      expectedRemoved: 0
    }
  ];

  for (const fixture of cases) {
    const before = createEffectiveFingerprint(fixture.css);
    const result = removeShadowedIdenticalDeclarations(fixture.css);
    const after = createEffectiveFingerprint(result.css);

    assert.equal(
      result.removed.length,
      fixture.expectedRemoved,
      `${fixture.name}: unerwartete Anzahl entfernter Deklarationen`
    );
    assert.equal(before, after, `${fixture.name}: effektiver Fingerprint hat sich verändert`);

    for (const expected of fixture.mustContain || []) {
      assert.ok(result.css.includes(expected), `${fixture.name}: erwarteter CSS-Teil fehlt: ${expected}`);
    }
  }
}
