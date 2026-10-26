// Existing hand-authored example; never supplied as an AI answer or fallback.
export const sheetPanPizza = {
  "title": "Sheet-pan pizza made with a spoon — 16×12 in (40×30 cm)",
  "setup": [
    "Use a bowl, spoon or spatula, plastic wrap, a rectangular sheet pan and a colander.",
    "The topping has ONE 25 g oil allowance (2 tbsp total), used partly in the sauce and partly for drizzling. The two oil-use rows are not two full quantities."
  ],
  "ingredients": [
    {
      "id": "dough_flour",
      "text": "Dough: type 0 flour — 550 g (about 4⅓ cups)",
      "prep": ""
    },
    {
      "id": "dough_water",
      "text": "Dough: water — 440 g (1.8 cups)",
      "prep": ""
    },
    {
      "id": "dough_yeast",
      "text": "Dough: fresh brewer’s yeast — 10 g (0.4 oz)",
      "prep": ""
    },
    {
      "id": "dough_oil",
      "text": "Dough: extra virgin olive oil — 30 g (2 tbsp)",
      "prep": ""
    },
    {
      "id": "dough_salt",
      "text": "Dough: fine salt — 10 g (1.7 tsp)",
      "prep": ""
    },
    {
      "id": "pan_oil",
      "text": "Pan: extra virgin olive oil — as needed",
      "prep": ""
    },
    {
      "id": "topping_tomato",
      "text": "Topping: tomato purée — 300 g (1¼ cups)",
      "prep": ""
    },
    {
      "id": "topping_oil_mix",
      "text": "Topping oil, use A: about half of the listed 25 g (2 tbsp total)",
      "prep": ""
    },
    {
      "id": "topping_oregano",
      "text": "Topping: oregano — to taste",
      "prep": ""
    },
    {
      "id": "topping_salt",
      "text": "Topping: fine salt — to taste",
      "prep": ""
    },
    {
      "id": "topping_oil_drizzle",
      "text": "Topping oil, use B: a little more from that SAME 25 g total, for drizzling",
      "prep": ""
    },
    {
      "id": "mozzarella",
      "text": "Fior di latte mozzarella — 250 g (9 oz)",
      "prep": ""
    },
    {
      "id": "basil",
      "text": "Basil — to taste",
      "prep": ""
    },
    {
      "id": "pepper",
      "text": "Black pepper — to taste",
      "prep": ""
    }
  ],
  "steps": [
    {
      "id": "mix_dough",
      "action": "Mix the flour, yeast and water in a bowl with a spoon or spatula until sticky.",
      "input_ids": [
        "dough_flour",
        "dough_water",
        "dough_yeast"
      ]
    },
    {
      "id": "rest_1",
      "action": "Cover with plastic wrap and rest for 10 minutes.",
      "input_ids": [
        "mix_dough"
      ]
    },
    {
      "id": "add_oil_salt",
      "action": "Add the dough oil and salt, then mix again with a spoon or spatula.",
      "input_ids": [
        "rest_1",
        "dough_oil",
        "dough_salt"
      ]
    },
    {
      "id": "rest_2",
      "action": "Cover and rest for another 10 minutes.",
      "input_ids": [
        "add_oil_salt"
      ]
    },
    {
      "id": "fold_dough",
      "action": "Fold in the bowl with a spatula: lift the edges and bring them to the center. The dough becomes smoother.",
      "input_ids": [
        "rest_2"
      ]
    },
    {
      "id": "rise",
      "action": "Cover with plastic wrap; let rise at 77–81°F (25–27°C) for about 3 hours, or until doubled.",
      "input_ids": [
        "fold_dough"
      ]
    },
    {
      "id": "grease_pan",
      "action": "Grease a 16×12 in (40×30 cm) rectangular pan.",
      "input_ids": [
        "pan_oil"
      ]
    },
    {
      "id": "spread_dough",
      "action": "Turn the risen dough into the greased pan and start spreading it with your hands.",
      "input_ids": [
        "rise",
        "grease_pan"
      ]
    },
    {
      "id": "rest_3",
      "action": "Cover again and rest for 10 minutes. Prepare the topping during this rest.",
      "input_ids": [
        "spread_dough"
      ]
    },
    {
      "id": "mix_topping",
      "action": "Meanwhile, mix the tomato purée, oregano, topping salt and about half the topping oil.",
      "input_ids": [
        "topping_tomato",
        "topping_oil_mix",
        "topping_oregano",
        "topping_salt"
      ]
    },
    {
      "id": "spread_again",
      "action": "Retrieve the dough and spread it further with your fingers.",
      "input_ids": [
        "rest_3"
      ]
    },
    {
      "id": "add_topping",
      "action": "Spread the prepared topping over the dough.",
      "input_ids": [
        "spread_again",
        "mix_topping"
      ]
    },
    {
      "id": "rest_topped",
      "action": "Drizzle with a little more of the topping oil and rest for half an hour.",
      "input_ids": [
        "add_topping",
        "topping_oil_drizzle"
      ]
    },
    {
      "id": "bake_1",
      "action": "Bake at 428°F (220°C) for 30 minutes. Prepare the mozzarella during this bake.",
      "input_ids": [
        "rest_topped"
      ]
    },
    {
      "id": "drain_cheese",
      "action": "Meanwhile, cut the fiordilatte and let it drain in a colander.",
      "input_ids": [
        "mozzarella"
      ]
    },
    {
      "id": "bake_2",
      "action": "After the first bake, add the drained mozzarella and bake for another 10 minutes.",
      "input_ids": [
        "bake_1",
        "drain_cheese"
      ]
    },
    {
      "id": "finish",
      "action": "Finish with basil and a pinch of black pepper.",
      "input_ids": [
        "bake_2",
        "basil",
        "pepper"
      ]
    }
  ]
};

// Supplied source retains concatenated ingredients and image placeholders.
export const pizzaSource = "INGREDIENTS\n\nIngredients for a 16x12 in sheet pan (40x30 cm)Type 0 flour 4.3 cups (550 g) - Approximately 4 1/3 cups.Water 1.8 cups (440 g)Extra virgin olive oil 2 tbsp (30 g)Fresh brewer's yeast 0.4 oz (10 g)Fine salt 1.7 tsp (10 g)For the toppingTomato purée 1 ¼ cup (300 g)Extra virgin olive oil 2 tbsp (25 g)Oregano to tasteFine salt to tasteFior di latte mozzarella cheese 9 oz (250 g)Basil to tasteBlack pepper to tasteFor the panExtra virgin olive oil to taste\n\nPreparation\nHow to prepare Sheet-pan pizza made with a spoon\n[Image: pasted image — use Add image to insert a local copy]\nTo prepare the sheet-pan pizza made with a spoon, start by working the flour and yeast 1 in a bowl together with the water 2 and mix with a spoon or spatula 3.\n[Image: pasted image — use Add image to insert a local copy]\nAs soon as the dough becomes sticky, cover with plastic wrap and let rest for 10 minutes 4. Then add the oil 5 and the salt 6.\n[Image: pasted image — use Add image to insert a local copy]\nThen mix again with a spatula or a spoon 7, cover and let rest another 10 minutes 8. At this point you can do folds, still in the bowl with the spatula: lift the edges of the dough and bring them to the center 9.\n[Image: pasted image — use Add image to insert a local copy]\nYou will notice the dough has changed texture and will be smoother 10. Cover with plastic wrap 11 and let rise at a temperature of 77–81°F (25–27°C) for about 3 hours or until doubled 12.\n[Image: pasted image — use Add image to insert a local copy]\nGrease a rectangular 12x16 in (30x40 cm) pan 13 and turn the dough into it 14. Start spreading it with your hands 15.\n[Image: pasted image — use Add image to insert a local copy]\nThen cover again for 10 minutes 16. Meanwhile prepare the topping: mix tomato passata, salt, oregano and about half the oil 17. Retrieve the dough and spread it further with your fingers 18.\n[Image: pasted image — use Add image to insert a local copy]\nSpread the topping over the surface 19, drizzle with a little more oil and let rest for half an hour. Then bake at 428°F for 30 minutes (220°C → 428°F) 20. Meanwhile cut the fiordilatte and let it drain in a colander 21.\n[Image: pasted image — use Add image to insert a local copy]\nAfter the baking time 22 place the fiordilatte (fresh mozzarella) on the pizza and bake for another 10 minutes 23. Finish with basil and a pinch of pepper and your sheet-pan pizza made with a spoon is ready 24.\nStorage\nSheet-pan pizza made with a spoon can be stored in the fridge for 1 day or frozen after baking.\nTip\nChoose a different topping each time for your sheet-pan pizza made with a spoon: grilled vegetables, ham and mushrooms or four cheeses.";
