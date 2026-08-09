const LAZY_DOM_DEFINITIONS = Object.freeze({
  shareCard: {
    templateId: "lazy-share-card-template",
    modalRef: "shareCardModal",
    refs: ["shareCardModal", "closeShareCard", "shareCardTemplate", "shareCardCanvas", "shareCardShare", "shareCardMessage"]
  },
  diagnostics: {
    templateId: "lazy-diagnostics-template",
    modalRef: "diagnosticsModal",
    refs: ["diagnosticsModal", "closeDiagnostics", "diagnosticsOverview", "diagnosticsCheckList", "diagnosticsErrorList", "diagnosticsMessage", "runDiagnostics", "exportDiagnostics", "clearDiagnostics", "openRecovery", "openTestMode"]
  },
  import: {
    templateId: "lazy-import-template",
    modalRef: "importModal",
    refs: ["importModal", "closeImport", "importFile", "importSummary", "importIssues", "importModeMerge", "importModeReplace", "importSubmit", "importMessage"]
  },
  conditionAssistant: {
    templateId: "lazy-condition-assistant-template",
    modalRef: "conditionAssistantModal",
    refs: ["conditionAssistantModal", "closeConditionAssistant", "conditionAssistantTargetLabel", "conditionAssistantProgressFill", "conditionAssistantImpressions", "conditionAssistantDefects", "conditionAssistantResult", "conditionAssistantAddNote", "conditionAssistantBack", "conditionAssistantNext", "conditionAssistantApply"]
  }
});

export function createLazyDomManager(elements, { afterMount = {} } = {}) {
  function ensure(name) {
    const definition = LAZY_DOM_DEFINITIONS[name];
    if (!definition) throw new Error(`Unbekannter Lazy-DOM-Bereich: ${name}`);
    if (elements[definition.modalRef]) return elements[definition.modalRef];

    const template = document.getElementById(definition.templateId);
    if (!template?.content || typeof template.content.cloneNode !== "function") {
      throw new Error(`Lazy-DOM-Template nicht gefunden oder ungültig: ${definition.templateId}`);
    }

    const fragment = template.content.cloneNode(true);
    const mountedRoot = fragment.firstElementChild;
    if (!mountedRoot) throw new Error(`Lazy-DOM-Template ist leer: ${definition.templateId}`);

    document.body.append(fragment);
    template.remove();

    definition.refs.forEach((ref) => {
      const selector = `#${camelToKebab(ref)}`;
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Lazy-DOM-Element fehlt nach Mount: ${selector}`);
      elements[ref] = element;
    });

    afterMount[name]?.();
    return mountedRoot;
  }

  return Object.freeze({ ensure });
}

function camelToKebab(value) {
  return String(value).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
