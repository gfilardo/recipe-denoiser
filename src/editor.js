import { sanitizeSource } from './sourceSanitizer.js';
export function setupEditor(editor, fileInput, onChange, onError) {
  const urls = new Set();
  const notify = () => onChange(editor.innerText.trim());
  function insert(fragment) {
    editor.focus(); const selection = window.getSelection();
    if (selection.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      const range = selection.getRangeAt(0); range.deleteContents();
      const last = fragment.lastChild; range.insertNode(fragment);
      if (last) { range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
    } else editor.append(fragment);
    notify();
  }
  async function images(files) {
    for (const file of files) {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 8 * 1024 * 1024) { onError('Use PNG, JPEG, WebP, or GIF images up to 8 MB.'); continue; }
      const url = URL.createObjectURL(file);
      const image = new Image(); image.src = url; image.alt = file.name || 'Recipe reference';
      try { await image.decode(); if (image.naturalWidth * image.naturalHeight > 24000000) throw Error('Image exceeds 24 megapixels.'); }
      catch { URL.revokeObjectURL(url); onError('Image could not be loaded or exceeds 24 megapixels.'); continue; }
      urls.add(url); const fragment = document.createDocumentFragment(); fragment.append(image, document.createElement('br')); insert(fragment);
    }
  }
  editor.addEventListener('input', notify);
  editor.addEventListener('paste', e => {
    e.preventDefault(); const data = e.clipboardData;
    const html = data.getData('text/html');
    if (html) insert(sanitizeSource(html));
    else if (data.files.length) void images(data.files);
    else { const fragment = document.createDocumentFragment(); const p = document.createElement('div'); p.style.whiteSpace = 'pre-wrap'; p.textContent = data.getData('text/plain'); fragment.append(p); insert(fragment); }
  });
  editor.addEventListener('dragover', e => e.preventDefault());
  editor.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) void images(e.dataTransfer.files); else { const fragment = document.createDocumentFragment(); fragment.append(document.createTextNode(e.dataTransfer.getData('text/plain'))); insert(fragment); } });
  fileInput.addEventListener('change', () => { void images(fileInput.files); fileInput.value = ''; });
  const observer = new MutationObserver(() => {
    for (const url of urls) if (![...editor.querySelectorAll('img')].some(img => img.src === url)) { URL.revokeObjectURL(url); urls.delete(url); }
  }); observer.observe(editor, { childList: true, subtree: true });
  return { text: () => editor.innerText.trim(), load(text) { editor.replaceChildren(); for (const paragraph of text.split('\n\n')) { const p = document.createElement('p'); p.style.whiteSpace = 'pre-wrap'; p.textContent = paragraph; editor.append(p); } notify(); } };
}
