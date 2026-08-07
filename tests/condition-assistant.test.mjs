import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConditionAssessmentNote,
  createConditionAssessment,
  evaluateConditionAssessment
} from "../condition-assistant.js";

test("Zustandsassistent empfiehlt Zustand 0 für ein praktisch makelloses vollständiges Heft", () => {
  const assessment = createConditionAssessment("0");
  assessment.comicComplete = true;
  assessment.coverComplete = true;
  assessment.impression = "pristine";
  assessment.defects = [];
  const result = evaluateConditionAssessment(assessment);
  assert.equal(result.code, "0");
  assert.equal(result.confidence, "high");
});

test("unvollständiger Comicteil führt unabhängig von weiteren Angaben zu Zustand 5", () => {
  const result = evaluateConditionAssessment({
    comicComplete: false,
    coverComplete: true,
    impression: "very-good",
    defects: []
  });
  assert.equal(result.code, "5");
  assert.match(result.description, /nicht vollständig/i);
});

test("ein Riss bis etwa fünf Zentimeter begrenzt die Empfehlung auf Zustand 2-3", () => {
  const result = evaluateConditionAssessment({
    comicComplete: true,
    coverComplete: true,
    impression: "near-perfect",
    defects: ["large-tear"]
  });
  assert.equal(result.code, "2-3");
  assert.match(buildConditionAssessmentNote({
    comicComplete: true,
    coverComplete: true,
    impression: "near-perfect",
    defects: ["large-tear"]
  }), /Riss bis etwa 5 cm/);
});

test("ein unvollständiger Umschlag wird konservativ mindestens als Zustand 4 eingeordnet", () => {
  const result = evaluateConditionAssessment({
    comicComplete: true,
    coverComplete: false,
    impression: "very-good",
    defects: []
  });
  assert.equal(result.code, "4");
  assert.ok(result.warnings.length > 0);
});
