# Lessons

## 2026-07-02 — partial-fill estimation method
- **Correction:** I proposed estimating a partial fill's consumption from a rolling average of past measured periods. The user wants the *proportional projection of the fill's own leg*: liters ÷ km driven × 100 (and € ÷ km × 100) — intuitive, per-entry, self-contained.
- **Rule:** for domain math in this project, prefer the transparent calculation the owner can verify on paper over the statistically smoother one. Flag any non-measured value as an estimate (`~`, dashed), and never let estimates leak into odometer/distance/monthly aggregates.

## 2026-07-02 — wrong numbers can be data, not code
- The "broken" efficiency feature was ultimately two flipped `is_full_tank` booleans in the live DB. When numbers look impossible, query the live rows before assuming a code bug — and make the code degrade gracefully (flags/estimates) instead of rendering blanks.
