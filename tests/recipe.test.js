import test from 'node:test';
import assert from 'node:assert/strict';
import { bananaBread } from '../src/fixtures/bananaBread.js';
import { layoutRecipe } from '../src/layoutRecipe.js';
import { availability } from '../src/aiService.js';
const fresh = () => structuredClone(bananaBread);
function occupancy(layout) {
  const grid = layout.rows.map(() => Array(layout.totalCols).fill(0));
  layout.rows.forEach((cells, row) => cells.forEach(c => {
    assert.ok(c.colSpan > 0 && c.rowSpan > 0);
    for (let r = row; r < row + c.rowSpan; r++) for (let col = c.startCol; col < c.startCol + c.colSpan; col++) {
      assert.ok(r < grid.length && col < layout.totalCols); grid[r][col]++;
    }
  }));
  assert.ok(grid.flat().every(v => v === 1));
}
test('Banana Bread exact reference spans and rectangular occupancy', () => {
  const layout = layoutRecipe(fresh()); assert.equal(layout.totalCols, 7); assert.equal(layout.rows.length, 10);
  for (const [id,row,startCol,rowSpan,colSpan] of [['step_1',0,2,4,1],['step_2',4,1,5,2],['step_3',0,3,10,1],['step_4',0,4,10,1],['step_5',0,5,10,1],['step_6',0,6,10,1]]) {
    const cell = layout.rows[row].find(c => c.id === id); assert.deepEqual([cell.startCol,cell.rowSpan,cell.colSpan],[startCol,rowSpan,colSpan]);
  }
  assert.equal(layout.rows[2].find(c => c.kind === 'prep').text, '');
  assert.equal(layout.rows[9].find(c => c.kind === 'prep').colSpan, 2);
  occupancy(layout);
});
test('Unary, mixed prep, compact groups and nested chains stay rectangular', () => {
  for (const prep of ['', 'chop']) {
    const r = { title:'Simple',setup:[],ingredients:[{id:'a',text:'one apple',prep}],steps:[{id:'s',action:'bake',input_ids:['a']}] };
    occupancy(layoutRecipe(r));
  }
  const r = fresh(); r.ingredients.forEach(i => i.prep = ''); occupancy(layoutRecipe(r));
  r.ingredients[5].prep = 'sift'; occupancy(layoutRecipe(r));
});
for (const [name, mutate, expected] of [
  ['duplicate ID',r=>r.ingredients[1].id='ing_1', /Duplicate/],
  ['missing reference',r=>r.steps[0].input_ids[0]='missing', /missing input/],
  ['cycle',r=>r.steps[0].input_ids[0]='step_6', /Cycle/],
  ['shared dependency',r=>r.steps[1].input_ids.push('ing_1'), /shared/],
  ['multiple roots',r=>r.steps.push({id:'extra',action:'extra',input_ids:['ing_1']}), /shared|terminal/],
  ['disconnected ingredient',r=>r.ingredients.push({id:'extra',text:'extra',prep:''}), /disconnected/],
  ['wrong order',r=>r.ingredients.reverse(), /order/],
  ['additional field',r=>r.extra=true, /unexpected/],
  ['empty inputs',r=>r.steps[0].input_ids=[], /at least one input/]
]) test(`rejects ${name}`,()=>{const r=fresh(); mutate(r); assert.throws(()=>layoutRecipe(r),expected);});
test('all supported availability states pass through',async()=>{for(const state of ['available','downloadable','downloading','unavailable']) assert.equal(await availability({availability:async()=>state}),state);});
