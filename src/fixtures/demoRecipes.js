import {bananaBread, verboseRecipe} from './bananaBread.js';
import {halloweenMuffins, muffinSource} from './halloweenMuffins.js';
import {autumnCake, autumnSource} from './autumnCake.js';
import {sheetPanPizza, pizzaSource} from './sheetPanPizza.js';
export const demoRecipes = [
  {id:'banana-bread',label:'Banana Nut Bread',source:verboseRecipe,recipe:bananaBread},
  {id:'halloween-muffins',label:'Halloween Muffins',source:muffinSource,recipe:halloweenMuffins},
  {id:'autumn-cake',label:'Autumn Cake',source:autumnSource,recipe:autumnCake},
  {id:'sheet-pan-pizza',label:'Sheet-pan pizza made with a spoon',source:pizzaSource,recipe:sheetPanPizza}
];
