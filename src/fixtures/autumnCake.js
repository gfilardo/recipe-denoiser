// Hand-authored demonstration only; never used as an AI answer or fallback.
export const autumnCake = {
  "title": "Autumn Cake (7-inch pan)",
  "setup": [
    "Preheat conventional oven to 356F; use middle rack",
    "Line a 7-inch pan with parchment paper",
    "Use the same orange for zest and juice; reserve fruit after zesting. Source juice amounts differ between ingredient list and method; both are retained."
  ],
  "ingredients": [
    {
      "id": "ing_8",
      "text": "Eggs 4",
      "prep": ""
    },
    {
      "id": "ing_9",
      "text": "Sugar 0.7 cup (135 g)",
      "prep": ""
    },
    {
      "id": "ing_11",
      "text": "Greek yogurt 0.7 cup (165 g)",
      "prep": ""
    },
    {
      "id": "ing_1",
      "text": "Type 00 flour 0.8 cup (100 g)",
      "prep": ""
    },
    {
      "id": "ing_2",
      "text": "Almond flour 1 cup (100 g)",
      "prep": ""
    },
    {
      "id": "ing_12",
      "text": "Baking powder 1 ½ tsp (6 g)",
      "prep": ""
    },
    {
      "id": "ing_5",
      "text": "Cardamon ½ tsp (1 g) — ground",
      "prep": ""
    },
    {
      "id": "ing_10",
      "text": "Rose water 1 tsp (5 g)",
      "prep": ""
    },
    {
      "id": "ing_6",
      "text": "Pistachios 1.8 oz (50 g) — batter",
      "prep": ""
    },
    {
      "id": "ing_7",
      "text": "Orange peel 1",
      "prep": ""
    },
    {
      "id": "ing_3",
      "text": "Almond milk ¼ cup (65 g)",
      "prep": ""
    },
    {
      "id": "ing_4",
      "text": "Saffron threads 0.004 oz (0.1 g)",
      "prep": ""
    },
    {
      "id": "ing_17",
      "text": "Orange juice 3.4 oz (100 g) — from reserved fruit; method says about 3.5 oz (about 1/3 cup)",
      "prep": ""
    },
    {
      "id": "ing_13",
      "text": "Pistachios 1.8 oz (50 g) — garnish",
      "prep": ""
    },
    {
      "id": "ing_14",
      "text": "Almonds 0.3 cup (50 g)",
      "prep": ""
    },
    {
      "id": "ing_16",
      "text": "Edible flowers to taste — hibiscus",
      "prep": ""
    },
    {
      "id": "ing_15",
      "text": "Powdered sugar to taste",
      "prep": ""
    }
  ],
  "steps": [
    {
      "id": "step_1",
      "action": "Heat almond milk on low without boiling",
      "input_ids": [
        "ing_3"
      ]
    },
    {
      "id": "step_2",
      "action": "When lukewarm, turn off heat; add saffron and infuse. Allow to reach room temperature",
      "input_ids": [
        "step_1",
        "ing_4"
      ]
    },
    {
      "id": "step_3",
      "action": "Blanch batter pistachios in boiling water for a couple of minutes",
      "input_ids": [
        "ing_6"
      ]
    },
    {
      "id": "step_4",
      "action": "Drain onto clean towel, dry well, peel; roughly chop with knife and set aside",
      "input_ids": [
        "step_3"
      ]
    },
    {
      "id": "step_5",
      "action": "Break eggs into bowl, add sugar; beat with electric whisks until light, voluminous and frothy",
      "input_ids": [
        "ing_8",
        "ing_9"
      ]
    },
    {
      "id": "step_6",
      "action": "Fold yogurt in little by little using a hand whisk; avoid deflating batter",
      "input_ids": [
        "step_5",
        "ing_11"
      ]
    },
    {
      "id": "step_7",
      "action": "Sift both flours and baking powder in another bowl",
      "input_ids": [
        "ing_1",
        "ing_2",
        "ing_12"
      ]
    },
    {
      "id": "step_8",
      "action": "Incorporate dry ingredients little by little, whisking gently until homogeneous and lump-free",
      "input_ids": [
        "step_6",
        "step_7"
      ]
    },
    {
      "id": "step_9",
      "action": "Add ground cardamom and rose water; fold in chopped pistachios",
      "input_ids": [
        "step_8",
        "ing_5",
        "ing_10",
        "step_4"
      ]
    },
    {
      "id": "step_10",
      "action": "Add grated orange zest; reserve fruit for juice",
      "input_ids": [
        "step_9",
        "ing_7"
      ]
    },
    {
      "id": "step_11",
      "action": "Whisk in room-temperature saffron milk; combine thoroughly until uniform",
      "input_ids": [
        "step_10",
        "step_2"
      ]
    },
    {
      "id": "step_12",
      "action": "Transfer batter to parchment-lined 7-inch pan",
      "input_ids": [
        "step_11"
      ]
    },
    {
      "id": "step_13",
      "action": "Bake in preheated conventional oven at 356F, middle rack, about 50 minutes. Check center with toothpick: it should come out dry",
      "input_ids": [
        "step_12"
      ]
    },
    {
      "id": "step_14",
      "action": "Remove from oven; rest in pan for 10 minutes, then gently unmold onto serving plate",
      "input_ids": [
        "step_13"
      ]
    },
    {
      "id": "step_15",
      "action": "Meanwhile squeeze reserved orange and strain juice; method calls for about 3.5 oz (about 1/3 cup)",
      "input_ids": [
        "ing_17"
      ]
    },
    {
      "id": "step_16",
      "action": "While cake is still warm, brush surface evenly with orange juice; cool completely",
      "input_ids": [
        "step_14",
        "step_15"
      ]
    },
    {
      "id": "step_17",
      "action": "Decorate with garnish pistachios, unpeeled almonds, hibiscus flowers and a dusting of powdered sugar; serve",
      "input_ids": [
        "step_16",
        "ing_13",
        "ing_14",
        "ing_16",
        "ing_15"
      ]
    }
  ]
};

// Line-separated source supplied by the user, loaded as plain text.
export const autumnSource = "INGREDIENTS\n\nFOR A 7-INCH PAN\nType 00 flour 0.8 cup (100 g)\nAlmond flour 1 cup (100 g)\nAlmond milk ¼ cup (65 g)\nSaffron threads 0.004 oz (0.1 g)\nCardamon ½ tsp (1 g) - ground\nPistachios 1.8 oz (50 g)\nOrange peel 1\nEggs 4\nSugar 0.7 cup (135 g)\nRose water 1 tsp (5 g)\nGreek yogurt 0.7 cup (165 g)\nBaking powder 1 ½ tsp (6 g)\nFOR GARNISH\nPistachios 1.8 oz (50 g)\nAlmonds 0.3 cup (50 g)\nPowdered sugar to taste\nEdible flowers to taste - hibiscus\nOrange juice 3.4 oz (100 g)\n\nPREPARATION\nHOW TO PREPARE AUTUMN CAKE\n\nTo make the Autumn Cake, first pour the almond milk into a small saucepan and heat it over low heat without letting it boil. When it is lukewarm, turn off the heat, add the saffron threads 1 and let them infuse 2 while you continue with the preparation. Meanwhile, blanch the pistachios in boiling water 3 for a couple of minutes.\n\nDrain them onto a clean kitchen towel 4, dry them well 5 and peel them 6. Blanching will make the skins come off easily.\n\nRoughly chop them with a knife 7 8 and set aside. Break the eggs into a large bowl and add the sugar 9.\n\nBeat with electric whisks 10 until you obtain a light, voluminous and frothy mixture. Add the Greek yogurt little by little 11, folding it in gently with a whisk by hand so as not to deflate the batter 12.\n\nIn another bowl sift the all-purpose flour together with the almond flour 13 and the baking powder 14. Incorporate part of the dry ingredients into the batter 15.\n\nGently mix with the whisk 16, then continue in this way adding the dry ingredients little by little 17 18, until you obtain a homogeneous, lump-free batter.\n\nAt this point add the ground cardamom 19 and the rose water 20, then fold in the chopped pistachios 21.\n\nAdd the grated orange zest 22, keeping the fruit aside: the juice will be used to brush the cake. Whisk and finally pour in the almond milk with the saffron threads, now at room temperature 24.\n\nThoroughly combine all the ingredients until you obtain a uniform mixture 25. Transfer the batter into a 7-inch pan lined with parchment paper 26. Bake in a preheated conventional oven at 356F, on the middle rack, for about 50 minutes. Before removing from the oven, check the doneness by inserting a toothpick into the center of the cake: it should come out dry. Remove the cake from the oven 27 and let it rest in the pan for 10 minutes. Meanwhile, squeeze the orange and strain the juice; you will need about 3.5 oz (about 1/3 cup).\n\nAfter this time, unmold it gently and transfer it to a serving plate 28. While still warm, brush the surface with the orange juice 29, distributing it evenly. Let the cake cool completely, then decorate the surface with the pistachios 30.\n\nAlso add the unpeeled almonds 31, hibiscus flowers 32 and a dusting of powdered sugar. Your Autumn Cake is ready to be served!";
