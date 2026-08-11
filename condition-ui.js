import { getConditionLabel } from "./config.js";

export function createConditionBadge(conditionCode, contextLabel) {
  const badge = document.createElement("span");
  const normalizedCode = String(conditionCode || "").toUpperCase();
  const classToken = normalizedCode.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  badge.className = `condition-badge condition-${classToken}`;
  badge.textContent = normalizedCode || "–";
  badge.title = `${contextLabel}: ${getConditionLabel(normalizedCode)}`;
  badge.setAttribute("aria-label", badge.title);
  return badge;
}
