import test from "node:test";
import assert from "node:assert/strict";

Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() { return payload; }
  };
}

test("Duckipedia-Cover werden auch bei nicht freien PageImages angefragt", async () => {
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    return jsonResponse({
      query: {
        pages: [{
          title: "LTB 601",
          revisions: [{ slots: { main: { content: "{{Infobox|LTBTITEL=Zurück ins Mikroland|EDATUM=26. August 2025}}" } } }],
          thumbnail: { source: "https://de.duckipedia.org/images/thumb/example/LTB_601.jpg/720px-LTB_601.jpg" }
        }]
      }
    });
  };

  const { lookupDuckipediaMetadata } = await import(`../duckipedia.js?license=${Date.now()}`);
  const result = await lookupDuckipediaMetadata("Lustiges Taschenbuch", 601);
  assert.equal(requests[0].searchParams.get("pilicense"), "any");
  assert.equal(result.coverUrl, "https://de.duckipedia.org/images/thumb/example/LTB_601.jpg/720px-LTB_601.jpg");
  assert.equal(result.publicationYear, 2025);
});

test("Duckipedia-Cover fallen bei fehlendem PageImage auf die Dateiliste zurück", async () => {
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const prop = url.searchParams.get("prop");
    if (prop === "revisions|pageimages") {
      return jsonResponse({
        query: { pages: [{ title: "LTB 602", revisions: [{ slots: { main: { content: "{{Infobox|LTBTITEL=Das Ende einer Legende|EDATUM=2025}}" } } }] }] }
      });
    }
    if (prop === "images") {
      return jsonResponse({ query: { pages: [{ images: [{ title: "Datei:Logo.png" }, { title: "Datei:LTB 602.jpg" }] }] } });
    }
    if (prop === "imageinfo") {
      return jsonResponse({ query: { pages: [{ imageinfo: [{ thumburl: "https://de.duckipedia.org/images/thumb/example/LTB_602.jpg/720px-LTB_602.jpg" }] }] } });
    }
    throw new Error(`Unerwartete Anfrage: ${url}`);
  };

  const { lookupDuckipediaMetadata } = await import(`../duckipedia.js?fallback=${Date.now()}`);
  const result = await lookupDuckipediaMetadata("Lustiges Taschenbuch", 602);
  assert.equal(result.coverUrl, "https://de.duckipedia.org/images/thumb/example/LTB_602.jpg/720px-LTB_602.jpg");
  assert.ok(requests.some((url) => url.searchParams.get("prop") === "images"));
  assert.ok(requests.some((url) => url.searchParams.get("prop") === "imageinfo"));
});
