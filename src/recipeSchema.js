export const RECIPE_DAG_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Recipe title and serving yield, e.g., 'Banana Nut Bread (about 10 servings)'" },
    setup: { type: "array", items: { type: "string" }, description: "Global setup actions before mixing ingredients, e.g., preheating oven or greasing pans." },
    ingredients: {
      type: "array", items: {
        type: "object", properties: {
          id: { type: "string", description: "Unique short ID like 'ing_1', 'ing_2'" },
          text: { type: "string", description: "Amount, unit, and ingredient name, e.g., '2 large (250 g) ripe bananas'" },
          prep: { type: "string", description: "Single-ingredient prep action if any (e.g., 'mash', 'melt', 'lightly beat'), or empty string '' if none." }
        }, required: ["id", "text", "prep"], additionalProperties: false
      }
    },
    steps: {
      type: "array", items: {
        type: "object", properties: {
          id: { type: "string", description: "Unique short ID like 'step_1', 'step_2'" },
          action: { type: "string", description: "Concise verb phrase for the action, e.g., 'mash until smooth', 'whisk', 'fold', 'bake 350°F (170°C) 55 min.'" },
          input_ids: { type: "array", items: { type: "string" }, description: "Array of ingredient IDs ('ing_X') and/or previous step IDs ('step_Y') that are combined or processed in this step." }
        }, required: ["id", "action", "input_ids"], additionalProperties: false
      }
    }
  }, required: ["title", "setup", "ingredients", "steps"], additionalProperties: false
};
