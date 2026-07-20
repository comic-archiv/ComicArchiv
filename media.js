const MAX_INPUT_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_WIDTH = 720;
const MAX_HEIGHT = 1080;
const JPEG_QUALITY = 0.78;

export async function prepareCoverImage(file) {
  if (!(file instanceof Blob)) {
    throw new Error("Bitte wähle eine Bilddatei aus.");
  }

  if (file.size > MAX_INPUT_SIZE_BYTES) {
    throw new Error("Das ausgewählte Bild ist größer als 25 MB.");
  }

  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Die ausgewählte Datei ist kein Bild.");
  }

  const source = await decodeImage(file);
  const dimensions = calculateTargetDimensions(source.width, source.height);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    releaseDecodedImage(source);
    throw new Error("Das Bild konnte nicht verarbeitet werden.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
  releaseDecodedImage(source);

  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);

  if (!blob) {
    throw new Error("Das komprimierte Cover konnte nicht erzeugt werden.");
  }

  return {
    blob,
    mimeType: blob.type || "image/jpeg",
    size: blob.size,
    width: canvas.width,
    height: canvas.height,
    source: "user",
    updatedAt: new Date().toISOString()
  };
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Das Cover konnte nicht für das Backup gelesen werden."));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);

  if (!match) {
    throw new Error("Das Medien-Backup enthält ein ungültiges Coverbild.");
  }

  const binary = atob(match[2].replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: match[1].toLowerCase() });
}

function calculateTargetDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error("Die Bildabmessungen konnten nicht ermittelt werden.");
  }

  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        kind: "bitmap"
      };
    } catch (error) {
      console.warn("createImageBitmap konnte das Cover nicht laden, Image-Fallback wird verwendet:", error);
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Das Bildformat konnte auf diesem Gerät nicht gelesen werden."));
      element.src = objectUrl;
    });

    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      kind: "image",
      objectUrl
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function releaseDecodedImage(source) {
  if (source.kind === "bitmap" && typeof source.image.close === "function") {
    source.image.close();
  }

  if (source.objectUrl) {
    URL.revokeObjectURL(source.objectUrl);
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
