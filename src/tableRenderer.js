export function renderRecipe(recipe, layout, target) {
  const title = document.createElement('h3'); title.className = 'recipe-title'; title.textContent = recipe.title;
  const table = document.createElement('table'); table.className = 'recipe-table'; table.setAttribute('aria-label', recipe.title + ', dependency grid read left to right');
  const body = table.createTBody();
  for (const text of recipe.setup) { const cell = body.insertRow().insertCell(); cell.colSpan = layout.totalCols; cell.className = 'setup-cell'; cell.textContent = text; }
  const inputs = new Map(recipe.steps.map(s => [s.id, s.input_ids]));
  function highlight(id) {
    const upstream = new Set();
    function visit(node) { upstream.add(node); (inputs.get(node) ?? []).forEach(visit); }
    if (id) visit(id);
    table.querySelectorAll('[data-node]').forEach(cell => cell.classList.toggle('upstream', upstream.has(cell.dataset.node)));
  }
  for (const row of layout.rows) {
    const tr = body.insertRow();
    for (const descriptor of row) {
      const cell = tr.insertCell(); cell.textContent = descriptor.text; cell.rowSpan = descriptor.rowSpan; cell.colSpan = descriptor.colSpan; cell.className = descriptor.kind; cell.dataset.node = descriptor.id;
      if (descriptor.kind === 'action') {
        cell.tabIndex = 0;
        cell.addEventListener('mouseenter', () => highlight(descriptor.id)); cell.addEventListener('mouseleave', () => highlight(null));
        cell.addEventListener('focus', () => highlight(descriptor.id)); cell.addEventListener('blur', () => highlight(null));
      }
    }
  }
  target.replaceChildren(title, table);
}
export function renderText(recipe, target) {
  target.replaceChildren();
  for (const [heading, entries] of [['Setup', recipe.setup], ['Ingredients', recipe.ingredients.map(i => i.text + (i.prep ? ` — ${i.prep}` : ''))], ['Steps', recipe.steps.map(s => `${s.action} (${s.input_ids.join(', ')})`)]]) {
    const h = document.createElement('h3'); h.textContent = heading;
    const list = document.createElement('ol'); entries.forEach(text => { const li = document.createElement('li'); li.textContent = text; list.append(li); }); target.append(h,list);
  }
}
