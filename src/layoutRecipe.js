import { validateRecipe } from './validateRecipe.js';
export function layoutRecipe(recipe) {
  const { nodes, root } = validateRecipe(recipe);
  let row = 0;
  function build(id) {
    const data = nodes.get(id);
    if (!data.input_ids) return { ...data, firstRowIndex: row++, leafCount: 1, startCol: 0, children: [] };
    const children = data.input_ids.map(build);
    const compact = children.length > 1 && children.every(c => !c.input_ids && !c.prep.trim());
    return { ...data, children, compact, firstRowIndex: children[0].firstRowIndex,
      leafCount: children.reduce((n,c) => n + c.leafCount, 0),
      startCol: compact ? 1 : Math.max(...children.map(c => c.input_ids ? c.startCol + 1 : 2)) };
  }
  const tree = build(root.id), totalCols = tree.startCol + 1;
  const rows = Array.from({ length: row }, () => []);
  function emit(node, parent) {
    const common = { id: node.id, rowSpan: node.leafCount, startCol: node.startCol,
      colSpan: node.input_ids && parent ? parent.startCol - node.startCol : 1 };
    rows[node.firstRowIndex].push({ ...common, text: node.action ?? node.text, kind: node.input_ids ? 'action' : 'ingredient' });
    if (!node.input_ids && !parent.compact) rows[node.firstRowIndex].push({ id: node.id, text: node.prep, kind: 'prep', rowSpan: 1, startCol: 1, colSpan: parent.startCol - 1 });
    node.children.forEach(c => emit(c, node));
  }
  emit(tree, null);
  rows.forEach(r => r.sort((a,b) => a.startCol - b.startCol));
  return { totalCols, rows, tree };
}
