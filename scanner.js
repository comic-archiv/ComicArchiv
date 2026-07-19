const MAX_IMAGE_EDGE = 2200;
const IMAGE_DECODE_TIMEOUT_MS = 7000;
const INTERIM_MESSAGE_INTERVAL_MS = 1400;

const EXTENDED_EAN_READERS = Object.freeze([
  {
    format: "ean_reader",
    config: {
      supplements: ["ean_5_reader", "ean_2_reader"]
    }
  },
  "ean_reader"
]);

export class MagazineBarcodeScanner {
  constructor(targetElement) {
    if (!(targetElement instanceof HTMLElement)) {
      throw new TypeError("Für den Scanner wird ein Zielelement benötigt.");
    }

    this.targetElement = targetElement;
    this.isStarting = false;
    this.isRunning = false;
    this.sessionId = 0;
    this.detectHandler = null;
    this.processedHandler = null;
    this.lastInterimAt = 0;
  }

  isSupported() {
    return Boolean(
      window.isSecureContext &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      window.Quagga?.init &&
      window.Quagga?.start
    );
  }

  async start({ onDetected, onInterim, onError } = {}) {
    if (this.isStarting || this.isRunning) {
      return;
    }

    if (!this.isSupported()) {
      throw new Error(
        "Die Kamera kann hier nicht gestartet werden. Öffne Sammlerhausen über die HTTPS-Adresse oder nutze den Foto-Fallback."
      );
    }

    this.stop();
    this.isStarting = true;
    const currentSession = ++this.sessionId;
    this.targetElement.replaceChildren();

    const config = {
      inputStream: {
        name: "Sammlerhausen Kamera",
        type: "LiveStream",
        target: this.targetElement,
        area: {
          top: "12%",
          right: "4%",
          left: "4%",
          bottom: "12%"
        },
        constraints: {
          facingMode: { ideal: "environment" },
          width: { min: 640, ideal: 1920 },
          height: { min: 480, ideal: 1080 },
          aspectRatio: { ideal: 1.7777778 }
        }
      },
      frequency: 12,
      numOfWorkers: 0,
      locate: true,
      locator: {
        halfSample: true,
        patchSize: "medium"
      },
      decoder: {
        readers: EXTENDED_EAN_READERS,
        multiple: false
      }
    };

    try {
      await initializeQuagga(config);

      if (currentSession !== this.sessionId) {
        safelyStopQuagga();
        return;
      }

      this.detectHandler = (result) => {
        const payload = extractScanPayloadFromResult(result);

        if (!payload) {
          return;
        }

        this.stop();
        onDetected?.(payload);
      };

      this.processedHandler = (result) => {
        if (!result || extractScanPayloadFromResult(result)) {
          return;
        }

        if (!containsMainBarcode(result)) {
          return;
        }

        const now = Date.now();
        if (now - this.lastInterimAt < INTERIM_MESSAGE_INTERVAL_MS) {
          return;
        }

        this.lastInterimAt = now;
        onInterim?.({
          type: "main-code-only",
          text: getPrimaryCode(result)
        });
      };

      window.Quagga.onDetected(this.detectHandler);
      window.Quagga.onProcessed(this.processedHandler);
      window.Quagga.start();
      this.isRunning = true;
    } catch (error) {
      this.removeQuaggaCallbacks();
      safelyStopQuagga();
      this.targetElement.replaceChildren();
      const normalizedError = normalizeCameraError(error);
      onError?.(normalizedError);
      throw normalizedError;
    } finally {
      this.isStarting = false;
    }
  }

  stop() {
    this.sessionId += 1;
    this.removeQuaggaCallbacks();

    if (this.isRunning || this.isStarting) {
      safelyStopQuagga();
    }

    this.isRunning = false;
    this.isStarting = false;
    this.targetElement.querySelectorAll("video").forEach((video) => {
      const stream = video.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      video.pause();
      video.srcObject = null;
    });
    this.targetElement.replaceChildren();
  }

  async decodeImageFile(file) {
    if (!(file instanceof File)) {
      throw new TypeError("Bitte wähle eine Bilddatei aus.");
    }

    if (!window.Quagga?.decodeSingle) {
      throw new Error("Die lokale Scanner-Bibliothek konnte nicht geladen werden.");
    }

    let mainCodeDetected = false;
    const sourceUrls = [];
    const canvases = [];

    try {
      const originalUrl = URL.createObjectURL(file);
      sourceUrls.push(originalUrl);

      const originalResult = await decodeImageSource(originalUrl, {
        halfSample: true,
        patchSize: "medium",
        inputSize: 1600
      });

      if (originalResult.payload) {
        return originalResult.payload;
      }
      mainCodeDetected ||= originalResult.mainCodeDetected;

      const image = await loadImageFile(file);
      const attempts = createImageAttempts(image);
      canvases.push(...attempts);
      image.remove();

      for (const canvas of attempts) {
        const objectUrl = await canvasToObjectUrl(canvas);
        sourceUrls.push(objectUrl);

        const result = await decodeImageSource(objectUrl, {
          halfSample: false,
          patchSize: canvas.width > 1100 ? "medium" : "small",
          inputSize: Math.min(1800, Math.max(canvas.width, canvas.height))
        });

        if (result.payload) {
          return result.payload;
        }
        mainCodeDetected ||= result.mainCodeDetected;
      }
    } finally {
      sourceUrls.forEach((url) => URL.revokeObjectURL(url));
      canvases.forEach((canvas) => canvas.remove());
    }

    if (mainCodeDetected) {
      throw new Error(
        "Der große Barcode wurde erkannt, der kleine Zusatzcode aber nicht. Fotografiere die gesamte weiße Barcodefläche möglichst gerade, scharf und mit etwas Abstand."
      );
    }

    throw new Error(
      "Auf dem Foto wurde kein passender zwei- oder fünfstelliger Zusatzcode erkannt."
    );
  }

  removeQuaggaCallbacks() {
    if (!window.Quagga) {
      return;
    }

    if (this.detectHandler) {
      window.Quagga.offDetected(this.detectHandler);
      this.detectHandler = null;
    }

    if (this.processedHandler) {
      window.Quagga.offProcessed(this.processedHandler);
      this.processedHandler = null;
    }
  }
}

export function parseSupplementToBandNumber(value) {
  const normalized = String(value ?? "").trim();

  if (!/^(?:\d{2}|\d{5})$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 99999 ? parsed : null;
}

export function extractScanPayloadFromResult(result) {
  const candidates = normalizeQuaggaResults(result);

  for (const candidate of candidates) {
    const codeResult = candidate?.codeResult;
    if (!codeResult) {
      continue;
    }

    let extension = String(codeResult.supplement?.code ?? "").trim();
    const fullCode = String(codeResult.code ?? "").replace(/\s+/g, "");
    const format = String(codeResult.format ?? "");

    if (!extension && /^(?:ean_2|ean_5)$/i.test(format) && /^(?:\d{2}|\d{5})$/.test(fullCode)) {
      extension = fullCode;
    }

    if (!extension) {
      const mainLength = getMainBarcodeLength(format, fullCode);
      const possibleExtension = mainLength > 0 ? fullCode.slice(mainLength) : "";
      if (/^(?:\d{2}|\d{5})$/.test(possibleExtension)) {
        extension = possibleExtension;
      }
    }

    const bandNumber = parseSupplementToBandNumber(extension);
    if (bandNumber === null) {
      continue;
    }

    const mainBarcode = fullCode.endsWith(extension)
      ? fullCode.slice(0, -extension.length)
      : fullCode;

    return {
      extension,
      bandNumber,
      mainBarcode,
      format
    };
  }

  return null;
}

function initializeQuagga(config) {
  return new Promise((resolve, reject) => {
    window.Quagga.init(config, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function safelyStopQuagga() {
  try {
    window.Quagga?.stop?.();
  } catch (error) {
    console.warn("Kamera konnte nicht vollständig gestoppt werden:", error);
  }
}

function decodeImageSource(src, { halfSample, patchSize, inputSize }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(value);
    };

    const timeout = window.setTimeout(() => {
      finish({ payload: null, mainCodeDetected: false });
    }, IMAGE_DECODE_TIMEOUT_MS);

    window.Quagga.decodeSingle(
      {
        src,
        numOfWorkers: 0,
        locate: true,
        inputStream: {
          size: Math.max(640, Math.round(inputSize || 1200))
        },
        locator: {
          halfSample,
          patchSize
        },
        decoder: {
          readers: EXTENDED_EAN_READERS,
          multiple: true
        }
      },
      (result) => {
        finish({
          payload: extractScanPayloadFromResult(result),
          mainCodeDetected: containsMainBarcode(result)
        });
      }
    );
  });
}

function normalizeQuaggaResults(result) {
  if (!result) {
    return [];
  }

  return Array.isArray(result) ? result.filter(Boolean) : [result];
}

function containsMainBarcode(result) {
  return normalizeQuaggaResults(result).some((candidate) => {
    const format = String(candidate?.codeResult?.format ?? "").toLowerCase();
    const code = String(candidate?.codeResult?.code ?? "").replace(/\s+/g, "");
    return /^(?:ean_13|ean_8|upc_a|upc_e)$/.test(format) || /^\d{8,18}$/.test(code);
  });
}

function getPrimaryCode(result) {
  const candidate = normalizeQuaggaResults(result).find((entry) => entry?.codeResult?.code);
  return String(candidate?.codeResult?.code ?? "");
}

function getMainBarcodeLength(format, fullCode) {
  const normalizedFormat = String(format || "").toLowerCase();
  if (normalizedFormat === "ean_13") return 13;
  if (normalizedFormat === "ean_8") return 8;
  if (normalizedFormat === "upc_a") return 12;
  if (normalizedFormat === "upc_e") return 8;

  if (/^\d{15}$/.test(fullCode) || /^\d{18}$/.test(fullCode)) {
    return 13;
  }

  return 0;
}

function normalizeCameraError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || error || "");

  if (name === "NotAllowedError" || name === "PermissionDeniedError" || /permission|denied|not allowed/i.test(message)) {
    return new Error(
      "Der Kamerazugriff wurde nicht erlaubt. Erlaube Sammlerhausen den Kamerazugriff in den iPhone-Einstellungen oder nutze ein Foto."
    );
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError" || /no device|not found/i.test(message)) {
    return new Error("Es wurde keine verfügbare Kamera gefunden.");
  }

  if (name === "NotReadableError" || name === "TrackStartError" || /could not start|not readable/i.test(message)) {
    return new Error("Die Kamera wird gerade von einer anderen App verwendet oder konnte nicht gestartet werden.");
  }

  return new Error(message || "Die Kamera konnte nicht gestartet werden.");
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.alt = "Ausgewähltes Barcodefoto";

    const cleanupUrl = () => URL.revokeObjectURL(objectUrl);

    image.addEventListener("load", () => {
      cleanupUrl();
      resolve(image);
    }, { once: true });

    image.addEventListener("error", () => {
      cleanupUrl();
      image.remove();
      reject(new Error("Das ausgewählte Foto konnte nicht geöffnet werden."));
    }, { once: true });

    image.src = objectUrl;
  });
}

function createImageAttempts(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error("Das Foto besitzt keine auswertbare Größe.");
  }

  return [
    createCropCanvas(image, 0, Math.floor(height * 0.42), width, Math.ceil(height * 0.58)),
    createCropCanvas(image, 0, Math.floor(height * 0.58), width, Math.ceil(height * 0.42)),
    createCropCanvas(image, 0, Math.floor(height * 0.68), width, Math.ceil(height * 0.32)),
    createCropCanvas(
      image,
      Math.floor(width * 0.06),
      Math.floor(height * 0.62),
      Math.ceil(width * 0.88),
      Math.ceil(height * 0.34)
    ),
    createCropCanvas(
      image,
      Math.floor(width * 0.18),
      Math.floor(height * 0.72),
      Math.ceil(width * 0.68),
      Math.ceil(height * 0.24),
      { enhance: true }
    )
  ];
}

function createCropCanvas(image, sourceX, sourceY, sourceWidth, sourceHeight, { enhance = false } = {}) {
  const scale = Math.min(enhance ? 5 : 1.8, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Das Foto konnte nicht für die Barcode-Erkennung vorbereitet werden.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  if (enhance) {
    enhanceBarcodeCanvas(context, canvas.width, canvas.height);
  }

  return canvas;
}

function enhanceBarcodeCanvas(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const histogram = new Uint32Array(256);
  let minimum = 255;
  let maximum = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = Math.round(
      (pixels[index] * 0.299) +
      (pixels[index + 1] * 0.587) +
      (pixels[index + 2] * 0.114)
    );
    minimum = Math.min(minimum, luminance);
    maximum = Math.max(maximum, luminance);
    pixels[index] = luminance;
    pixels[index + 1] = luminance;
    pixels[index + 2] = luminance;
  }

  const range = Math.max(1, maximum - minimum);
  for (let index = 0; index < pixels.length; index += 4) {
    const normalized = Math.max(0, Math.min(255, Math.round(((pixels[index] - minimum) * 255) / range)));
    histogram[normalized] += 1;
    pixels[index] = normalized;
    pixels[index + 1] = normalized;
    pixels[index + 2] = normalized;
  }

  const threshold = Math.max(150, Math.min(180, calculateOtsuThreshold(histogram, width * height) + 15));
  for (let index = 0; index < pixels.length; index += 4) {
    const value = pixels[index] >= threshold ? 255 : 0;
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
  }

  context.putImageData(imageData, 0, 0);
}

function calculateOtsuThreshold(histogram, totalPixels) {
  let weightedTotal = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    weightedTotal += value * histogram[value];
  }

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let bestThreshold = 150;

  for (let value = 0; value < histogram.length; value += 1) {
    backgroundWeight += histogram[value];
    if (backgroundWeight === 0) continue;

    const foregroundWeight = totalPixels - backgroundWeight;
    if (foregroundWeight === 0) break;

    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (weightedTotal - backgroundSum) / foregroundWeight;
    const difference = backgroundMean - foregroundMean;
    const variance = backgroundWeight * foregroundWeight * difference * difference;

    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = value;
    }
  }

  return bestThreshold;
}

function canvasToObjectUrl(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Der Fotoausschnitt konnte nicht vorbereitet werden."));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/jpeg", 0.94);
  });
}
