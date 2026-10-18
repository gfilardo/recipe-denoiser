const allowed = new Set(['P','BR','DIV','UL','OL','LI','STRONG','B','EM','I','H1','H2','H3','H4','BLOCKQUOTE']);
const removed = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','BUTTON','LINK','META','TEMPLATE']);
export function sanitizeSource(html, doc = document) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const fragment = doc.createDocumentFragment();
  function copy(node, target) {
    if (node.nodeType === 3) { target.append(doc.createTextNode(node.textContent)); return; }
    if (node.nodeType !== 1 || removed.has(node.tagName) || node.hidden || node.getAttribute('aria-hidden') === 'true') return;
    if (node.tagName === 'IMG') {
      const label = doc.createElement('span');
      label.textContent = `[Image: ${node.getAttribute('alt') || 'pasted image'} — use Add image to insert a local copy]`;
      target.append(label); return;
    }
    const parent = allowed.has(node.tagName) ? doc.createElement(node.tagName.toLowerCase()) : target;
    if (parent !== target) target.append(parent);
    for (const child of node.childNodes) copy(child, parent);
  }
  for (const child of parsed.body.childNodes) copy(child, fragment);
  return fragment;
}
