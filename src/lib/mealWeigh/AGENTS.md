# Pesar refeição
- "Pesar refeição" keeps rules pure in `src/lib/mealWeigh` (macros via nutritionEngine, base matching, tare check, planned×weighed) and reads photos through food-scanner's `weigh` action (same official Claude call, `has_premium_scale` checked before the AI); logs are insert-only in meal_weigh_logs, so the published diet and daily tracking stay untouched.
