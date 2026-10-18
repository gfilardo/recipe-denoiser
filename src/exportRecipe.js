export function recipeHTML(output) {
  const clone = output.cloneNode(true);
  clone.querySelectorAll('[data-node]').forEach(cell => { cell.removeAttribute('tabindex'); cell.removeAttribute('data-node'); cell.classList.remove('upstream'); });
  const table = clone.querySelector('table'); table.style.cssText = 'border:2px solid #54a857;border-collapse:collapse;background:#fff;font-family:Trebuchet MS,Arial,sans-serif;color:#172418;font-size:14px';
  clone.querySelectorAll('td').forEach(cell => { cell.style.cssText = `border:1px solid #54a857;padding:6px 10px;vertical-align:middle;text-align:${cell.classList.contains('ingredient') ? 'left' : 'center'}`; });
  return clone.innerHTML;
}
export async function copyRecipe(output) {
  const html = recipeHTML(output);
  if (globalThis.ClipboardItem && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([html], { type: 'text/plain' }) })]);
    return;
  }
  if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable. Use Download HTML instead.');
  await navigator.clipboard.writeText(html);
}
export function downloadRecipe(output) {
  const url = URL.createObjectURL(new Blob([`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recipe grid</title><body style="background:#fdfbe2;padding:20px">${recipeHTML(output)}</body></html>`], { type: 'text/html' }));
  const a = document.createElement('a'); a.href = url; a.download = 'recipe-grid.html'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
