import {bananaBread,verboseRecipe} from '../../src/fixtures/bananaBread.js';
import {acceptIngredients} from '../../src/recipeExtraction.js';
export const inventory=acceptIngredients({title:bananaBread.title,ingredients:bananaBread.ingredients.map(n=>({text:n.text,role:''}))},verboseRecipe);
export const plan={
  setup:bananaBread.setup.map(text=>({text,source:'Butter and flour a loaf pan and preheat the oven to 350°F (170°C).'})),
  preparations:[['ing_1','mash'],['ing_2','melt'],['ing_4','lightly beat']].map(([ingredient_id,text])=>({ingredient_id,text,source:'Mash the bananas, melt the butter, and lightly beat the eggs.'})),
  actions:[
    ['Combine wet ingredients; mash until smooth.','Combine the bananas, melted butter, vanilla, and eggs and mash until smooth.'],
    ['Whisk dry ingredients.','In a separate bowl, whisk the flour, sugar, baking soda, baking powder, and salt.'],
    ['Fold with walnuts; avoid overmixing.','Fold the wet mixture, dry mixture, and chopped walnuts together. Avoid overmixing.'],
    ['Transfer to prepared loaf pan; bake at 350°F (170°C) for 55 minutes.','Transfer the batter to the prepared loaf pan and bake at 350°F (170°C) for 55 minutes.'],
    ['Cool 10 minutes in pan.','Cool for 10 minutes in the pan, then turn out and cool on a wire rack.'],
    ['Turn out; cool on wire rack.','Cool for 10 minutes in the pan, then turn out and cool on a wire rack.']
  ].map(([action,source])=>({action,source}))
};
