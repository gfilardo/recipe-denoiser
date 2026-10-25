export const source = 'Yogurt sauce\n1 cup yogurt\n1 tsp lemon juice\n1 pinch salt\nMix lemon juice and salt. Stir into yogurt and serve.';
export const ingredients = { title: 'Yogurt sauce', ingredients: ['1 cup yogurt', '1 tsp lemon juice', '1 pinch salt'].map(text=>({text,role:'sauce'})) };
export const actions = { setup:[], preparations:[], actions: ['Mix lemon juice and salt.', 'Stir into yogurt and serve.'].map(action=>({action,source:action})) };
export const links = { inputs: [['ing_2', 'ing_3'], ['step_1', 'ing_1']] };
