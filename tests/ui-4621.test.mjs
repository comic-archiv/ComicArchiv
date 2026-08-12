import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../styles/refinements.css", import.meta.url), "utf8");

test("4.6.21 reduziert mobilen Header wirklich statt nur die Mindesthöhe zu ändern", () => {
  assert.match(css, /\.app-header\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?safe-area-inset-top\) - 14px/);
  assert.match(css, /\.app-header \.brand-mark\.brand-logo\s*\{[\s\S]*?width:\s*36px;[\s\S]*?height:\s*36px;/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.app-header \.brand \.eyebrow\s*\{[\s\S]*?display:\s*none;/);
  assert.match(css, /\.app-header #theme-toggle\s*\{[\s\S]*?width:\s*38px;[\s\S]*?min-height:\s*38px;/);
});

test("4.6.21 überschreibt die alte direkte Bottom-Nav-Span-Schriftgröße", () => {
  assert.match(css, /\.bottom-nav\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?safe-area-inset-bottom\) - 8px/);
  assert.match(css, /\.bottom-nav-item\s*\{[\s\S]*?min-height:\s*42px;/);
  assert.match(css, /\.bottom-nav-item > span:not\(\.bottom-nav-icon-wrap\)\s*\{[\s\S]*?font-size:\s*0\.68rem;/);
  assert.match(css, /\.bottom-nav-primary\s*\{[\s\S]*?margin-top:\s*-5px;[\s\S]*?min-height:\s*46px;/);
  assert.match(css, /\.bottom-nav-primary > span\s*\{[\s\S]*?font-size:\s*0\.72rem;/);
});

test("4.6.21 behält die Safari-sichere Share-Card-Begrenzung", () => {
  assert.match(css, /#share-card-modal \.share-card-modal-card\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*560px;[\s\S]*?min-width:\s*0;/);
  assert.match(css, /#share-card-modal \.share-card-preview\s*\{[\s\S]*?width:\s*100%;[\s\S]*?contain:\s*inline-size;/);
});
