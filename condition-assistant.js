const CONDITION_DETAILS = Object.freeze({
  "0": Object.freeze({ label: "Perfekt", priceRelation: "ca. 150 % von Zustand 1", description: "Praktisch makellos und ungelesen wirkend; nur minimale produktionsbedingte Unregelmäßigkeiten sind zulässig." }),
  "0-1": Object.freeze({ label: "Fast perfekt", priceRelation: "Zwischenstufe zwischen Zustand 0 und 1", description: "Neuwertig mit höchstens minimalen Lagerungs- oder Öffnungsspuren." }),
  "1": Object.freeze({ label: "Sehr gut", priceRelation: "Basispreis = 100 %", description: "Nahezu fehlerfrei mit einzelnen unauffälligen Kleinstmängeln." }),
  "1-2": Object.freeze({ label: "Fast sehr gut", priceRelation: "Zwischenstufe zwischen Zustand 1 und 2", description: "Sehr gepflegt mit mehreren Kleinstfehlern oder einem einzelnen etwas größeren Mangel." }),
  "2": Object.freeze({ label: "Gut", priceRelation: "ca. 40 % von Zustand 1", description: "Ordentlich erhalten; Knicke, kleinere Risse, Beschriftungen oder Verschmutzungen bleiben in tolerierbarem Rahmen." }),
  "2-3": Object.freeze({ label: "Noch recht gut", priceRelation: "Zwischenstufe zwischen Zustand 2 und 3", description: "Erkennbar gebraucht mit häufigeren oder stärkeren Mängeln, aber noch insgesamt befriedigend." }),
  "3": Object.freeze({ label: "Noch sammelwürdig", priceRelation: "ca. 20 % von Zustand 1", description: "Vollständig und oft gelesen; Klebungen, kleine Fehlstellen oder starke Falzschäden sind möglich." }),
  "3-4": Object.freeze({ label: "Schlecht", priceRelation: "Zwischenstufe zwischen Zustand 3 und 4", description: "Sehr stark gebraucht mit hoher Mängeldichte, aber noch mit Lesewert." }),
  "4": Object.freeze({ label: "Zum Wegwerfen zu schade", priceRelation: "ca. 10 % von Zustand 1", description: "Comicteil und Umschlag sind noch vorhanden; der Band dient meist nur als Platzhalter." }),
  "5": Object.freeze({ label: "Unvollständiger Comic", priceRelation: "Keine reguläre Zustandsbewertung", description: "Der Comicteil ist nicht vollständig und fällt daher aus dem regulären Zustandssystem." })
});

const CONDITION_ORDER = Object.freeze(["0", "0-1", "1", "1-2", "2", "2-3", "3", "3-4", "4", "5"]);

export const CONDITION_ASSISTANT_IMPRESSIONS = Object.freeze([
  Object.freeze({ id: "pristine", code: "0", label: "Praktisch makellos", help: "Wirkt ungelesen; höchstens minimale produktionsbedingte Unregelmäßigkeiten." }),
  Object.freeze({ id: "near-perfect", code: "0-1", label: "Nahezu neuwertig", help: "Nur minimale Lagerungs- oder Öffnungsspuren sind erkennbar." }),
  Object.freeze({ id: "very-good", code: "1", label: "Sehr gepflegt", help: "Nahezu fehlerfrei, allenfalls einzelne unauffällige Kleinstmängel." }),
  Object.freeze({ id: "well-kept", code: "1-2", label: "Gepflegt mit kleinen Spuren", help: "Mehrere Kleinstfehler oder ein einzelner etwas größerer Mangel." }),
  Object.freeze({ id: "good", code: "2", label: "Ordentlich gebraucht", help: "Knicke, kleine Risse, Schriftzüge oder Verschmutzungen stören den guten Gesamteindruck noch nicht." }),
  Object.freeze({ id: "clearly-used", code: "2-3", label: "Deutlich gebraucht", help: "Mängel treten häufiger oder stärker auf, das Heft bleibt insgesamt befriedigend." }),
  Object.freeze({ id: "collectible", code: "3", label: "Stark gelesen, aber sammelwürdig", help: "Deutliche Falzschäden, Klebungen oder kleinere Fehlstellen sind möglich." }),
  Object.freeze({ id: "poor", code: "3-4", label: "Sehr stark gebraucht", help: "Sehr große Häufung von Mängeln, aber die Geschichte bleibt lesbar." }),
  Object.freeze({ id: "placeholder", code: "4", label: "Nur noch Platzhalter", help: "Comicteil und Umschlag sind vorhanden, an sonstigen Mängeln ist fast alles möglich." })
]);

export const CONDITION_ASSISTANT_DEFECT_GROUPS = Object.freeze([
  Object.freeze({
    id: "light",
    title: "Leichte Spuren",
    description: "Diese Punkte begrenzen einen ansonsten sehr guten Band.",
    defects: Object.freeze([
      Object.freeze({ id: "storage", code: "0-1", label: "Minimale Lagerungsspur oder leicht angestoßene Ecke", note: "minimale Lagerungsspur" }),
      Object.freeze({ id: "tiny-tear", code: "1", label: "Einriss im Millimeterbereich oder einzelner kleiner Knick", note: "kleiner Einriss/Knick" }),
      Object.freeze({ id: "many-tiny", code: "1-2", label: "Mehrere Kleinstfehler", note: "mehrere Kleinstfehler" }),
      Object.freeze({ id: "small-tear", code: "1-2", label: "Ein einzelner Riss bis etwa 2 cm", note: "Riss bis etwa 2 cm" }),
      Object.freeze({ id: "light-water", code: "1-2", label: "Leichter Wasserschaden oder kleiner Fettfleck", note: "leichter Wasserschaden/Fettfleck" })
    ])
  }),
  Object.freeze({
    id: "medium",
    title: "Deutliche Gebrauchsspuren",
    description: "Diese Mängel passen in den Bereich Zustand 2 bis 2–3.",
    defects: Object.freeze([
      Object.freeze({ id: "writing", code: "2", label: "Schriftzug, Stempel oder gelöste Rätsel", note: "Schriftzug/Stempel/gelöste Rätsel" }),
      Object.freeze({ id: "missing-stamp", code: "2", label: "Sammelmarke oder Sammelbild fehlt", note: "Sammelmarke/Sammelbild fehlt" }),
      Object.freeze({ id: "large-tear", code: "2-3", label: "Riss bis etwa 5 cm", note: "Riss bis etwa 5 cm" }),
      Object.freeze({ id: "strong-water", code: "2-3", label: "Größerer Wasserschaden, Stock- oder deutliche Flecken", note: "größerer Wasser-/Stockschaden oder Flecken" }),
      Object.freeze({ id: "restored", code: "2-3", label: "Professionell restauriert", note: "Restauration" }),
      Object.freeze({ id: "small-tape", code: "2-3", label: "Tesa sparsam verwendet", note: "Tesa sparsam verwendet" })
    ])
  }),
  Object.freeze({
    id: "heavy",
    title: "Starke Mängel",
    description: "Diese Punkte führen mindestens in den Bereich Zustand 3 bis 4.",
    defects: Object.freeze([
      Object.freeze({ id: "glued", code: "3", label: "Deutliche Klebung oder starke Falzschäden", note: "Klebung/starke Falzschäden" }),
      Object.freeze({ id: "small-missing", code: "3", label: "Kleinere Fehlstelle ohne Textverlust", note: "kleinere Fehlstelle ohne Textverlust" }),
      Object.freeze({ id: "loose-cover", code: "3", label: "Umschlag oder Mittelseite von den Klammern gelöst", note: "Umschlag/Mittelseite gelöst" }),
      Object.freeze({ id: "punched", code: "3", label: "Heft ist gelocht", note: "Lochung" }),
      Object.freeze({ id: "bad-repair", code: "3-4", label: "Unsachgemäße Reparatur mit Fremdmaterial", note: "unsachgemäße Reparatur" }),
      Object.freeze({ id: "trimmed", code: "3-4", label: "Aus Sammelband beschnitten", note: "beschnitten" }),
      Object.freeze({ id: "large-missing", code: "3-4", label: "Größere Fehlstellen ohne störenden Einfluss auf die Geschichte", note: "größere Fehlstellen" }),
      Object.freeze({ id: "painted", code: "4", label: "Bilder bemalt oder große Stücke fehlen", note: "Bemalungen/größere Fehlstellen" })
    ])
  })
]);

const ALL_DEFECTS = Object.freeze(CONDITION_ASSISTANT_DEFECT_GROUPS.flatMap((group) => group.defects));

export function createConditionAssessment(currentCode = "2") {
  const normalized = normalizeConditionCode(typeof currentCode === "object" ? currentCode?.conditionCode : currentCode);
  const impression = CONDITION_ASSISTANT_IMPRESSIONS.find((entry) => entry.code === normalized)?.id || "good";
  return {
    comicComplete: normalized === "5" ? false : null,
    coverComplete: null,
    impression,
    defects: []
  };
}

export function evaluateConditionAssessment(input = {}) {
  const assessment = normalizeAssessment(input);
  if (assessment.comicComplete === false) {
    return createResult("5", {
      confidence: "high",
      reasons: ["Der Comicteil ist nicht vollständig."],
      warnings: ["Unvollständige Comics werden außerhalb des regulären Zustandsrasters als Zustand 5 geführt."],
      note: "Zustandshinweis: Comicteil unvollständig"
    });
  }

  if (assessment.comicComplete === null || assessment.coverComplete === null || !assessment.impression) {
    return Object.freeze({
      code: "",
      label: "Angaben unvollständig",
      priceRelation: "",
      description: "Bitte beantworte die offenen Fragen.",
      confidence: "low",
      reasons: Object.freeze([]),
      warnings: Object.freeze([]),
      note: ""
    });
  }

  const impression = CONDITION_ASSISTANT_IMPRESSIONS.find((entry) => entry.id === assessment.impression)
    || CONDITION_ASSISTANT_IMPRESSIONS[4];
  let code = impression.code;
  const reasons = [`Gesamteindruck: ${impression.label}.`];
  const warnings = [];
  const selectedDefects = assessment.defects
    .map((id) => ALL_DEFECTS.find((entry) => entry.id === id))
    .filter(Boolean);

  selectedDefects.forEach((defect) => { code = worseCondition(code, defect.code); });
  if (selectedDefects.length) {
    const worstRank = Math.max(...selectedDefects.map((entry) => getConditionRank(entry.code)));
    const strongest = selectedDefects.filter((entry) => getConditionRank(entry.code) === worstRank);
    reasons.push(`Stärkste berücksichtigte Mängel: ${strongest.map((entry) => entry.label).join("; ")}.`);
  } else {
    reasons.push("Keine zusätzlichen besonderen Mängel ausgewählt.");
  }

  if (assessment.coverComplete === false) {
    code = worseCondition(code, "4");
    warnings.push("Der Umschlag ist nicht vollständig. Dokumentiere den konkreten Verlust unbedingt in den Notizen.");
  }

  let confidence = "high";
  if (assessment.coverComplete === false || selectedDefects.length >= 4) confidence = "medium";
  if (selectedDefects.some((entry) => ["restored", "bad-repair", "large-missing", "painted"].includes(entry.id))) {
    confidence = "medium";
    warnings.push("Bei Restaurationen oder größeren Fehlstellen ist eine individuelle Gesamtbetrachtung besonders wichtig.");
  }

  const notes = selectedDefects.map((entry) => entry.note).filter(Boolean);
  if (assessment.coverComplete === false) notes.push("Umschlag unvollständig");
  const note = notes.length ? `Zustandshinweis: ${[...new Set(notes)].join(", ")}` : "";
  return createResult(code, { confidence, reasons, warnings, note });
}

export function buildConditionAssessmentNote(input = {}) {
  if (typeof input?.note === "string") return input.note;
  return evaluateConditionAssessment(input).note || "";
}

function normalizeAssessment(input) {
  return {
    comicComplete: input?.comicComplete === true ? true : input?.comicComplete === false ? false : null,
    coverComplete: input?.coverComplete === true ? true : input?.coverComplete === false ? false : null,
    impression: CONDITION_ASSISTANT_IMPRESSIONS.some((entry) => entry.id === input?.impression) ? input.impression : "",
    defects: Array.isArray(input?.defects) ? [...new Set(input.defects.map(String))] : []
  };
}

function createResult(code, { confidence, reasons, warnings, note = "" }) {
  const details = CONDITION_DETAILS[code] || CONDITION_DETAILS["2"];
  return Object.freeze({
    code,
    label: details.label,
    priceRelation: details.priceRelation,
    description: details.description,
    confidence,
    reasons: Object.freeze(reasons || []),
    warnings: Object.freeze(warnings || []),
    note
  });
}

function worseCondition(first, second) {
  return getConditionRank(second) > getConditionRank(first) ? second : first;
}

function getConditionRank(code) {
  const index = CONDITION_ORDER.indexOf(normalizeConditionCode(code));
  return index < 0 ? CONDITION_ORDER.indexOf("2") : index;
}

function normalizeConditionCode(code) {
  const normalized = String(code || "2").trim().replace(/–/g, "-");
  return CONDITION_ORDER.includes(normalized) ? normalized : "2";
}
