export const APP_CONFIG = Object.freeze({
  dataFormatVersion: 1,
  storageName: "ComicArchiv",
  series: Object.freeze([
    "Lustiges Taschenbuch",
    "LTB Spezial",
    "LTB Premium",
    "LTB Enten-Edition",
    "LTB Maus-Edition",
    "LTB Ultimate Phantomias",
    "LTB Collection",
    "LTB Fantasy",
    "LTB Crime",
    "LTB Royal",
    "LTB History",
    "LTB Weihnachten",
    "LTB Ostern",
    "LTB Halloween",
    "LTB Sommer",
    "LTB Abenteuer",
    "LTB Young Comics",
    "Sonstige"
  ]),
  conditions: Object.freeze([
    { code: "N", label: "Neu" },
    { code: "NM", label: "Near Mint" },
    { code: "VF", label: "Very Fine" },
    { code: "FN", label: "Fine" },
    { code: "VG", label: "Very Good" },
    { code: "GD", label: "Good" },
    { code: "FR", label: "Fair" },
    { code: "PR", label: "Poor" }
  ])
});

export function getConditionLabel(code) {
  const condition = APP_CONFIG.conditions.find((entry) => entry.code === code);
  return condition ? `${condition.label} – ${condition.code}` : code;
}
