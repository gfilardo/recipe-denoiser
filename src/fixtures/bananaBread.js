export const bananaBread = {
  title: 'Banana Nut Bread (about 10 servings)',
  setup: ['Butter and flour a loaf pan', 'Preheat oven to 350°F (170°C)'],
  ingredients: [
    ['2 large (250 g) ripe bananas', 'mash'], ['6 Tbs. (90 mL) butter', 'melt'],
    ['1 tsp. (5 mL) vanilla extract', ''], ['2 large eggs', 'lightly beat'],
    ['1-1/3 cups (167 g) all-purpose flour', ''], ['2/3 cup (130 g) sugar', ''],
    ['1/2 tsp. (2.3 g) baking soda', ''], ['1/4 tsp. (1.2 g) baking powder', ''],
    ['1/2 tsp. (3 g) salt', ''], ['1/2 cup (70 g) chopped walnuts', '']
  ].map(([text, prep], i) => ({ id: `ing_${i + 1}`, text, prep })),
  steps: [
    ['mash until smooth', ['ing_1','ing_2','ing_3','ing_4']],
    ['whisk', ['ing_5','ing_6','ing_7','ing_8','ing_9']],
    ['fold', ['step_1','step_2','ing_10']],
    ['bake 350°F (170°C) 55 min.', ['step_3']],
    ['cool 10 min. in pan', ['step_4']], ['cool on wire rack', ['step_5']]
  ].map(([action, input_ids], i) => ({ id: `step_${i + 1}`, action, input_ids }))
};
export const verboseRecipe = `Banana Nut Bread (about 10 servings)

This is my favorite way to use the very ripe bananas sitting on the counter. The bread is lovely with tea the next day, if there is any left!

Ingredients
2 large (250 g) ripe bananas
6 Tbs. (90 mL) butter
1 tsp. (5 mL) vanilla extract
2 large eggs
1-1/3 cups (167 g) all-purpose flour
2/3 cup (130 g) sugar
1/2 tsp. (2.3 g) baking soda
1/4 tsp. (1.2 g) baking powder
1/2 tsp. (3 g) salt
1/2 cup (70 g) chopped walnuts

Butter and flour a loaf pan and preheat the oven to 350°F (170°C). Mash the bananas, melt the butter, and lightly beat the eggs. Combine the bananas, melted butter, vanilla, and eggs and mash until smooth.
In a separate bowl, whisk the flour, sugar, baking soda, baking powder, and salt. Fold the wet mixture, dry mixture, and chopped walnuts together. Avoid overmixing. Transfer the batter to the prepared loaf pan and bake at 350°F (170°C) for 55 minutes. Cool for 10 minutes in the pan, then turn out and cool on a wire rack.`;
