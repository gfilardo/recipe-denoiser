import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRecipe } from '../src/validateRecipe.js';
import { layoutRecipe } from '../src/layoutRecipe.js';
const recipe = JSON.parse(readFileSync(new URL('../examples/sheet-pan-pizza.json', import.meta.url), 'utf8'));

test('manual pizza reference forms one connected tree and a complete rectangular table', () => {
  const {root}=validateRecipe(recipe);
  assert.equal(root.id,'finish');
  const layout=layoutRecipe(recipe);
  assert.equal(layout.rows.length,14);assert.equal(recipe.steps.length,17);
  const grid=layout.rows.map(()=>Array(layout.totalCols).fill(0));
  layout.rows.forEach((cells,row)=>cells.forEach(c=>{
    assert.ok(c.rowSpan>0&&c.colSpan>0);
    for(let r=row;r<row+c.rowSpan;r++)for(let col=c.startCol;col<c.startCol+c.colSpan;col++){
      assert.ok(r<grid.length&&col<layout.totalCols);grid[r][col]++;
    }
  }));
  assert.ok(grid.flat().every(n=>n===1));
});

test('pizza reference preserves separate oil roles and parallel preparations without duplicating quantities', () => {
  const steps=new Map(recipe.steps.map(s=>[s.id,s]));
  assert.deepEqual(steps.get('mix_dough').input_ids,['dough_flour','dough_water','dough_yeast']);
  assert.deepEqual(steps.get('add_oil_salt').input_ids,['rest_1','dough_oil','dough_salt']);
  assert.deepEqual(steps.get('grease_pan').input_ids,['pan_oil']);
  assert.deepEqual(steps.get('spread_dough').input_ids,['rise','grease_pan']);
  assert.deepEqual(steps.get('add_topping').input_ids,['spread_again','mix_topping']);
  assert.deepEqual(steps.get('bake_2').input_ids,['bake_1','drain_cheese']);
  assert.deepEqual(steps.get('drain_cheese').input_ids,['mozzarella']);
  const ingredients=new Map(recipe.ingredients.map(i=>[i.id,i.text]));
  assert.match(ingredients.get('topping_oil_mix'),/about half.*25 g.*total/);
  assert.match(ingredients.get('topping_oil_drizzle'),/a little more.*SAME 25 g total/);
  assert.ok(!JSON.stringify(recipe).includes('12.5'));
  for(const id of ['rest_1','rest_2','rest_3'])assert.match(steps.get(id).action,/10 minutes/);
  assert.match(steps.get('rise').action,/77–81°F \(25–27°C\).*3 hours/);
  assert.match(steps.get('bake_1').action,/428°F \(220°C\).*30 minutes/);
  assert.match(steps.get('bake_2').action,/another 10 minutes/);
});
