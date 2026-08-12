import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../styles/refinements.css", import.meta.url), "utf8");

test("4.6.20 hält Header und Bottom-Navigation kompakt", () => {
  assert.match(css, /\.app-header\s*\{[\s\S]*?min-height:\s*calc\(58px \+ env\(safe-area-inset-top\)\)/);
  assert.match(css, /\.app-header \.brand-mark\.brand-logo\s*\{[\s\S]*?width:\s*42px;[\s\S]*?height:\s*42px;/);
  assert.match(css, /\.bottom-nav\s*\{[\s\S]*?min-height:\s*calc\(58px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.bottom-nav-item\s*\{[\s\S]*?min-height:\s*48px;/);
  assert.match(css, /\.bottom-nav-primary\s*\{[\s\S]*?min-height:\s*54px;/);
});

test("4.6.20 begrenzt den Share-Card-Dialog auf die verfügbare Breite", () => {
  assert.match(css, /#share-card-modal \.share-card-modal-card\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*560px;[\s\S]*?min-width:\s*0;/);
  assert.match(css, /#share-card-modal \.share-card-preview\s*\{[\s\S]*?width:\s*100%;[\s\S]*?contain:\s*inline-size;/);
  assert.match(css, /#share-card-modal select,[\s\S]*?max-width:\s*100%;/);
});
