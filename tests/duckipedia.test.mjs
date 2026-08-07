import test from "node:test";
import assert from "node:assert/strict";
import {
  DUCKIPEDIA_LOOKUP_VERSION,
  extractCoverFileName,
  extractInfoboxCoverUrlFromHtml,
  extractPublicationInfobox,
  lookupDuckipediaMetadata,
  parseDuckipediaWikitext
} from "../duckipedia.js";

test("Duckipedia-Vorlage liefert Titel, Jahr und explizite Coverdatei", () => {
  const parsed = parseDuckipediaWikitext(`
{{Infobox LTB
| LTBTITEL = Zurück ins Mikroland
| EDATUM = 26. August 2025
| BILD = Datei:LTB 601.jpg
| NRGESCH = 10
}}
  `);

  assert.equal(parsed.title, "Zurück ins Mikroland");
  assert.equal(parsed.publicationYear, 2025);
  assert.equal(parsed.coverFileName, "LTB 601.jpg");
  assert.equal(parsed.infoboxTemplate, "Infobox LTB");
});

test("Originalcover BILD gewinnt auf der echten Einzeilenstruktur von LTB 2 gegen NEU-BILD", () => {
  const source = "{{Rezi}} {{Infobox LTB | LTBNR = 2 | LTBTITEL = „Hallo... hier Micky!“ | NEU = Das ewige Feuer | EDATUM = Januar 1968 | BILD = Datei:Lutabu002.jpg | NEU-BILD = Datei:LTB-AK-300-002.jpg }}";
  const infobox = extractPublicationInfobox(source);
  const parsed = parseDuckipediaWikitext(source);

  assert.equal(infobox?.name, "Infobox LTB");
  assert.equal(parsed.title, "„Hallo... hier Micky!“");
  assert.equal(parsed.publicationYear, 1968);
  assert.equal(parsed.coverFileName, "Lutabu002.jpg");
});

test("Infobox-Parameter bleiben auch bei verschachtelten Vorlagen stabil", () => {
  const source = "{{Infobox LTB | LTBTITEL = Ein {{nowrap|besonderer}} Band | BILD = [[Datei:Cover Sonderband.png|250px]] | EDATUM = 2026 }}";
  const parsed = parseDuckipediaWikitext(source);
  assert.equal(parsed.title, "Ein Band");
  assert.equal(parsed.coverFileName, "Cover Sonderband.png");
  assert.equal(parsed.publicationYear, 2026);
});

test("Coverdateien werden aus Wiki-Links und Unterstrichen normalisiert", () => {
  assert.equal(extractCoverFileName("[[Datei:LTB_601.jpg|250px]]"), "LTB 601.jpg");
  assert.equal(extractCoverFileName("File:LTB_Fantasy_3.webp"), "LTB Fantasy 3.webp");
});

test("Gerenderte rechte Infobox liefert das große Cover statt Rezension und Logo", () => {
  const result = extractInfoboxCoverUrlFromHtml(`
    <p><img src="/images/thumb/d/da/Partitur_4.jpg/59px-Partitur_4.jpg" width="59" alt="Rezension"></p>
    <table class="infobox" style="float:right; margin-left:1em; width:310px">
      <tr><th>Lustiges Taschenbuch</th></tr>
      <tr><td><a href="/Datei:Lutabu002.jpg"><img src="//de.duckipedia.org/images/thumb/1/12/Lutabu002.jpg/250px-Lutabu002.jpg" width="250" height="356" alt="LTB 2"></a></td></tr>
      <tr><td>Erscheinungsdatum Januar 1968 · Geschichtenanzahl 5 · Seitenanzahl 256</td></tr>
      <tr><td><img src="/images/Ind.PNG" width="50" height="30" alt="Inducks"></td></tr>
    </table>
  `, "https://de.duckipedia.org/LTB_2");

  assert.equal(result, "https://de.duckipedia.org/images/thumb/1/12/Lutabu002.jpg/250px-Lutabu002.jpg");
});

test("Metadatenabfrage löst das im Infobox-Feld BILD genannte Cover über imageinfo auf", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.searchParams.get("prop") === "revisions") {
      return {
        ok: true,
        json: async () => ({
          query: {
            pages: [{
              revisions: [{
                slots: {
                  main: {
                    content: "{{Infobox LTB | LTBTITEL = Testband | EDATUM = 2026 | BILD = Datei:LTB 601.jpg }}"
                  }
                }
              }]
            }]
          }
        })
      };
    }
    if (url.searchParams.get("prop") === "imageinfo") {
      return {
        ok: true,
        json: async () => ({ query: { pages: [{ imageinfo: [{ thumburl: "https://de.duckipedia.org/images/thumb/example.jpg" }] }] } })
      };
    }
    throw new Error(`Unerwartete URL: ${url}`);
  };

  try {
    const result = await lookupDuckipediaMetadata("Lustiges Taschenbuch", 601);
    assert.equal(result.found, true);
    assert.equal(result.title, "Testband");
    assert.equal(result.coverFileName, "LTB 601.jpg");
    assert.equal(result.coverUrl, "https://de.duckipedia.org/images/thumb/example.jpg");
    assert.equal(result.coverSource, "infobox-wikitext");
    assert.equal(result.lookupVersion, 3);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].searchParams.get("titles"), "Datei:LTB 601.jpg");
    assert.equal(calls[1].searchParams.get("origin"), "*");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gerenderte Infobox ist der Fallback, wenn kein BILD-Feld vorhanden ist", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get("prop") === "revisions") {
      return {
        ok: true,
        json: async () => ({
          query: {
            pages: [{ revisions: [{ slots: { main: { content: "{{Infobox Sonderband | TITEL = Test | EDATUM = 2026 }}" } } }] }]
          }
        })
      };
    }
    if (url.searchParams.get("action") === "parse" && url.searchParams.get("prop") === "text") {
      return {
        ok: true,
        json: async () => ({
          parse: {
            text: `<table class="infobox" style="float:right;width:310px">
              <tr><th>Lustiges Taschenbuch · Band 2</th></tr>
              <tr><td><a href="/Datei:Korrektes Cover.png"><img width="250" height="360" alt="Cover Band 2" src="/images/thumb/a/ab/Korrektes_Cover.png/250px-Korrektes_Cover.png"></a></td></tr>
              <tr><td>Erscheinungsdatum · Geschichtenanzahl · Seitenanzahl</td></tr>
            </table>`
          }
        })
      };
    }
    throw new Error(`Unerwartete URL: ${url}`);
  };

  try {
    const result = await lookupDuckipediaMetadata("Lustiges Taschenbuch", 2);
    assert.equal(result.coverUrl, "https://de.duckipedia.org/images/thumb/a/ab/Korrektes_Cover.png/250px-Korrektes_Cover.png");
    assert.equal(result.coverSource, "infobox-html");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cover-Lookup-Version erzwingt die Reparatur alter Cacheeinträge", () => {
  assert.equal(DUCKIPEDIA_LOOKUP_VERSION, 3);
});
