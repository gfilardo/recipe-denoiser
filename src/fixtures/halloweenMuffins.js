// Hand-authored demonstration only; never supplied to AI conversion as an answer.
export const halloweenMuffins = {
  "title": "Halloween Muffins (12 muffins)",
  "setup": [
    "Preheat static oven to 350°F",
    "Place paper cases in a 12-muffin tray"
  ],
  "ingredients": [
    {
      "id": "ing_1",
      "text": "Sugar 0.67 cup (135 g)",
      "prep": ""
    },
    {
      "id": "ing_2",
      "text": "Butter 0.55 cup (125 g) — at room temperature",
      "prep": ""
    },
    {
      "id": "ing_3",
      "text": "Orange peel 1 — grated",
      "prep": ""
    },
    {
      "id": "ing_4",
      "text": "Eggs 3.9 oz (110 g) — 2 medium",
      "prep": ""
    },
    {
      "id": "ing_5",
      "text": "Type 00 flour 2 cups (265 g)",
      "prep": ""
    },
    {
      "id": "ing_6",
      "text": "Baking powder 1.3 tsp (6 g)",
      "prep": ""
    },
    {
      "id": "ing_7",
      "text": "Baking soda 0.8 tsp (4 g)",
      "prep": ""
    },
    {
      "id": "ing_8",
      "text": "Fine salt 1 pinch",
      "prep": ""
    },
    {
      "id": "ing_9",
      "text": "Whole milk 0.6 cup (135 g) — at room temperature",
      "prep": ""
    },
    {
      "id": "ing_10",
      "text": "Dark chocolate chips 3.5 oz (100 g)",
      "prep": ""
    },
    {
      "id": "ing_11",
      "text": "Food decorations 24 — small eyes",
      "prep": ""
    },
    {
      "id": "ing_12",
      "text": "Cocoa glaze 4.4 oz (125 g)",
      "prep": ""
    }
  ],
  "steps": [
    {
      "id": "step_1",
      "action": "Put sugar and softened butter in a bowl",
      "input_ids": [
        "ing_1",
        "ing_2"
      ]
    },
    {
      "id": "step_2",
      "action": "Add grated orange zest",
      "input_ids": [
        "step_1",
        "ing_3"
      ]
    },
    {
      "id": "step_3",
      "action": "Beat with electric whisk; add eggs one at a time. Continue until light and fluffy",
      "input_ids": [
        "step_2",
        "ing_4"
      ]
    },
    {
      "id": "step_4",
      "action": "Sift flour, baking powder and baking soda directly into mixture",
      "input_ids": [
        "step_3",
        "ing_5",
        "ing_6",
        "ing_7"
      ]
    },
    {
      "id": "step_5",
      "action": "Add salt; whisk to incorporate powders",
      "input_ids": [
        "step_4",
        "ing_8"
      ]
    },
    {
      "id": "step_6",
      "action": "Pour milk in a trickle until soft and homogeneous",
      "input_ids": [
        "step_5",
        "ing_9"
      ]
    },
    {
      "id": "step_7",
      "action": "Fold in chocolate chips with a spatula",
      "input_ids": [
        "step_6",
        "ing_10"
      ]
    },
    {
      "id": "step_8",
      "action": "Transfer to disposable piping bag without nozzle",
      "input_ids": [
        "step_7"
      ]
    },
    {
      "id": "step_9",
      "action": "Fill paper cases two-thirds full, leaving about half an inch from edge",
      "input_ids": [
        "step_8"
      ]
    },
    {
      "id": "step_10",
      "action": "Bake in preheated static oven at 350°F for 18–20 minutes",
      "input_ids": [
        "step_9"
      ]
    },
    {
      "id": "step_11",
      "action": "Remove from oven; cool completely; remove paper cases",
      "input_ids": [
        "step_10"
      ]
    },
    {
      "id": "step_12",
      "action": "Apply sugar eyes; stack muffins on a small plate",
      "input_ids": [
        "step_11",
        "ing_11"
      ]
    },
    {
      "id": "step_13",
      "action": "Boil water in saucepan; turn off heat. Immerse glaze packet for 7–8 minutes; remove and dry well before opening",
      "input_ids": [
        "ing_12"
      ]
    },
    {
      "id": "step_14",
      "action": "Pour glaze into pitcher; drizzle over muffins and serve",
      "input_ids": [
        "step_12",
        "step_13"
      ]
    }
  ]
};

// Preserve the concatenated ingredient list for realistic extraction experiments.
export const muffinSource = "INGREDIENTS\nFor 12 muffinsType 00 flour 2 cups (265 g)Sugar 0.67 cup (135 g)Whole milk 0.6 cup (135 g) - at room temperatureButter 0.55 cup (125 g) - at room temperatureEggs 3.9 oz (110 g) - (2 medium)Dark chocolate chips 3.5 oz (100 g)Baking powder 1.3 tsp (6 g)Orange peel 1 - (to be grated)Baking soda 0.8 tsp (4 g)Fine salt 1 pinchfor decorationCocoa glaze 4.4 oz (125 g)Food decorations 24 - small eyes\n\nPreparation\nHow to prepare Halloween Muffins\n[Image: pasted image — use Add image to insert a local copy]\nTo prepare the Halloween muffins, pour the sugar into a bowl and add the softened butter 1. Scent with grated orange zest 2, then start beating the mixture with an electric whisk, adding the eggs one at a time 3.\n[Image: pasted image — use Add image to insert a local copy]\nWork with the electric whisk until you get a light and fluffy mixture 4. Now sift the flour, baking powder, and baking soda directly into the bowl with the mixture 5. Also, add the pinch of salt and turn on the whisk again to incorporate the powders. You will notice that the batter becomes thicker, so thin it with the milk poured in a trickle 6.\n[Image: pasted image — use Add image to insert a local copy]\nWhen the mixture is soft and homogeneous 7, add the chocolate chips 8 and mix with a spatula to combine them 9.\n[Image: pasted image — use Add image to insert a local copy]\nTransfer the mixture to a disposable piping bag without a nozzle 10, this way you can work more precisely. Place the paper cases in a 12-muffin tray and fill them two-thirds full 11, leaving about half an inch from the edge 12.\n[Image: pasted image — use Add image to insert a local copy]\nBake in a preheated oven at 350°F for 18-20 minutes in static mode. Remove from the oven and let cool completely 13. At this point, your chocolate chip muffins are ready to be decorated. Remove the paper cases 14, then apply the sugar eyes 15.\n[Image: pasted image — use Add image to insert a local copy]\nStack the muffins on a small plate 16 and prepare the glaze: bring some water to a boil in a saucepan. Turn off the heat and place the cocoa glaze packet inside for 7-8 minutes. Take it out and dry the packet well before opening. Pour the glaze into a pitcher, then let it drizzle over the cupcakes 17. Your Halloween muffins are ready to be served 18!\nStorage\nWe recommend consuming the Halloween muffins immediately. Alternatively, you can store them without glaze for a couple of days under a glass dome.\nTip\nInstead of orange zest, you can use vanilla extract to flavor the batter.\nInstead of the piping bag, you can use a spoon to fill the paper cases.";
