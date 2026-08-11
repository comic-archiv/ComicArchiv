import { readFile } from "node:fs/promises";

export async function readProjectText(name) {
  return readFile(new URL(`../${name}`, import.meta.url), "utf8");
}

export async function readAppStyles() {
  const manifest = await readProjectText("style.css");
  const imports = [...manifest.matchAll(/@import\s+url\(["'](.+?)["']\)/g)].map((match) => match[1]);
  if (!imports.length) return manifest;
  const parts = await Promise.all(imports.map((path) => readFile(new URL(`../${path.replace(/^\.\//, "")}`, import.meta.url), "utf8")));
  return parts.join("\n");
}
