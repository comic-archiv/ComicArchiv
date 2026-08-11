import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=(f)=>readFile(new URL(`../${f}`,import.meta.url),"utf8");
test("DOM-Registry ist aus app.js ausgelagert",async()=>{
 const [app,elements]=await Promise.all([read("app.js"),read("app-elements.js")]);
 assert.match(app,/const elements = createAppElements\(\);/);
 assert.doesNotMatch(app,/const elements = \{/);
 assert.match(elements,/addPage: document\.querySelector\("#add-page"\)/);
 assert.match(elements,/toast: document\.querySelector\("#toast"\)/);
});
