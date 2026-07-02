# Lessons

## 2026-07-02 — partial-fill estimation method
- **Correction:** I proposed estimating a partial fill's consumption from a rolling average of past measured periods. The user wants the *proportional projection of the fill's own leg*: liters ÷ km driven × 100 (and € ÷ km × 100) — intuitive, per-entry, self-contained.
- **Rule:** for domain math in this project, prefer the transparent calculation the owner can verify on paper over the statistically smoother one. Flag any non-measured value as an estimate (`~`, dashed), and never let estimates leak into odometer/distance/monthly aggregates.

## 2026-07-02 — fuel attribution is FORWARD, not backward
- **Correction:** I paired each fill's fuel with the leg driven *before* it (backward). The owner's model is the opposite: the fuel you add powers the leg *until the next fill*. Backward attribution credited a €30 / 16.59 L partial with the 651 km the *previous* full tank actually powered → absurd 2.5 L/100km.
- **Rule:** `distance_km` = odo(next) − odo(this); consumption = this fill's liters ÷ that forward leg. The newest fill is "pending" (no number yet). This shifts every number back one fill vs. the full-tank refill method.

## 2026-07-02 — wrong numbers can be data, not code
- The "broken" efficiency feature was ultimately two flipped `is_full_tank` booleans in the live DB. When numbers look impossible, query the live rows before assuming a code bug — and make the code degrade gracefully (flags/estimates) instead of rendering blanks.
