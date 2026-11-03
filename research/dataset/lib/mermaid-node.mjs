// mermaid.parse in node: mermaid needs a DOM, so jsdom globals go in before import.
// Returns an async validator: text -> true (valid diagram) | false.
let parser;
export async function makeParseMermaid() {
  if (parser) return parser;
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><body></body>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({ startOnLoad: false });
  parser = async text => {
    try { return Boolean(await mermaid.parse(text, { suppressErrors: true })); }
    catch { return false; }
  };
  return parser;
}
