# Car Economic Analysis
**Date:** March 14, 2026
**Cars compared:** Nissan Pixo 2009 (old car) vs Mercedes A150 2005 (new car)

> **Note on fuel prices:** Fuel prices rose from **€1.749/L → €2.08/L** in March 2026 — a market-wide increase, not a difference in fuel type. Both cars use the same fuel. All cost projections in this report use the **current price of €2.08/L** for a fair comparison. The Nissan's past fill-up data was recorded at the old price, so its figures have been recalculated.

---

## ⚠️ Spreadsheet Note — "Yearly Est. Cost" Column Is Actually Liters, Not Euros

The formula in your Excel "Yearly Est. Cost" column is:

```
= (Total Liters Added so far) / (Total Days Elapsed so far) × 365
```

This gives **how many liters per year you consume** — it never multiplies by the fuel price, so it is **not a cost in euros**. The column name is misleading.

**To get actual yearly fuel cost → multiply that number by the current fuel price:**

| Yearly liters (spreadsheet) | × Old price (€1.749) | × Current price (€2.08) |
|---|---|---|
| Pixo: **552 L/year** | €965/year | **€1,148/year** |

My figures in this report use the correct euro calculation.

**Two additional bugs found in the spreadsheet:**
- Row 5's yearly formula is a copy of row 6's (looks one row too far ahead) — gives a slightly wrong value for row 5
- The Mercedes yearly cost formula is anchored to Nissan's rows, so it mixes both cars' data and produces an incorrect result for the Mercedes

---

## 1. What the Factory Says vs. What We Measure

To make the numbers meaningful, here is what the manufacturer officially claims, what real owners typically report, and what was actually measured in your data.

### Nissan Pixo 2009 — 1.0L Petrol

| Source | Consumption | What it means |
|---|---|---|
| Factory spec — highway | 4.9 L/100km | Best case, steady motorway driving |
| **Factory spec — combined** | **5.9 L/100km** | Official average (lab conditions) |
| Factory spec — city | 7.4 L/100km | Stop-start urban driving |
| Real-world owner average | 6.0–7.5 L/100km | What people actually get day-to-day |
| **Your measured average (3 fill-ups)** | **6.64 L/100km ✅** | Right in the middle of the normal range |

**What this means:** Your Pixo is performing exactly as expected. No mechanical concerns.

---

### Mercedes A150 2005 — 1.5L Petrol

| Source | Consumption | What it means |
|---|---|---|
| Factory spec — highway | 5.4 L/100km | Best case, steady motorway driving |
| **Factory spec — combined** | **6.8 L/100km** | Official average (lab conditions) |
| Factory spec — city | 9.2 L/100km | Stop-start urban driving |
| Real-world owner average (mixed) | 7.5–10.0 L/100km | What most owners report |
| Real-world owner average (pure city) | 9.0–12.0 L/100km | Heavy city use |
| **Your measured result (1 fill-up)** | **14.03 L/100km ⚠️** | Way above normal — see note below |

**What this means:** 14 L/100km is significantly above even pure-city owner reports. This is almost certainly because the single measurement covers only 220 km of short urban trips with cold engine starts. It will improve. A realistic settled average for this car with your driving pattern is **9–11 L/100km**.

> ⚠️ **Do not treat 14 L/100km as the Mercedes' real efficiency.** It is based on 1 fill-up over 10 days and 220 km — too short to be representative. Log 4–5 more fill-ups for a reliable picture.

---

## 2. Your Fill-up Log

### Nissan Pixo 2009

| Fill-up | Distance | Consumption | vs Factory combined | Context |
|---|---|---|---|---|
| #1 — Jan 5 | 430 km | 7.047 L/100km | +1.1 L above factory | Winter / holiday driving |
| #2 — Jan 21 | 456 km | 6.579 L/100km | +0.7 L above factory | Winter / normal usage |
| #3 — Feb 11 | 459 km | 6.307 L/100km | +0.4 L above factory | Winter / normal usage |
| **Average** | — | **6.64 L/100km** | **+0.74 L above factory** | Trending better over time ✅ |

The Pixo is getting more efficient fill-up to fill-up — likely as winter eases and the engine settles.

### Mercedes A150 2005

| Fill-up | Distance | Consumption | vs Factory combined | Context |
|---|---|---|---|---|
| #1 — Mar 14 | 220 km | 14.034 L/100km | +7.2 L above factory ⚠️ | Short city trips only |
| **Average** | — | **Too early to judge** | — | Need 4–5 more fill-ups |

---

## 3. What It Costs to Drive Each Car Today (at €2.08/L)

| | Nissan Pixo 2009 | Mercedes A150 2005 |
|---|---|---|
| Consumption | 6.64 L/100km | 14.03 L/100km (early reading) |
| Fuel price | €2.08/L | €2.08/L |
| **Cost per km** | **€0.138/km** | **€0.292/km** |

To put this in perspective at current prices:

| Journey | Pixo cost | Mercedes cost (current) | Mercedes cost (if 10 L/100km) |
|---|---|---|---|
| 10 km errand | €1.38 | €2.92 | €2.08 |
| 50 km round trip | €6.90 | €14.60 | €10.40 |
| 100 km drive | €13.80 | €29.20 | €20.80 |
| Weekly (160 km avg) | €22.08 | €46.72 | €33.28 |

---

## 4. Annual Fuel Cost (at €2.08/L)

Both cars are driven roughly the same distance (~22 km/day based on your logs).

| | Nissan Pixo | Mercedes (current 14 L/100km) | Mercedes (realistic 10 L/100km) |
|---|---|---|---|
| Annual km estimate | 8,322 km | 8,030 km | 8,030 km |
| Annual liters consumed | **552 L** | **1,127 L** | **803 L** |
| **Annual fuel cost** | **€1,148/year** | **€2,344/year** | **€1,670/year** |
| **Monthly fuel cost** | **€96/month** | **€195/month** | **€139/month** |
| Extra vs Pixo | — | +€1,196/year more | +€522/year more |

> The 552 L/year figure is what your spreadsheet correctly calculates — it just needs to be multiplied by €2.08 to get the euro cost of €1,148/year.

---

## 5. Impact of the March 2026 Fuel Price Hike (€1.749 → €2.08/L, +19%)

The same price increase hits harder the more fuel a car burns.

| | Nissan Pixo | Mercedes (if 10 L/100km) |
|---|---|---|
| Extra cost per km | +€0.022/km | +€0.033/km |
| Extra cost per 10,000 km | +€220 | +€331 |
| **Extra annual cost from hike alone** | **+€183/year** | **+€268/year** |

> At the Pixo's efficiency, the price hike costs you an extra **€15/month**. At 10 L/100km in the Mercedes it would be **€22/month extra** — just from the price change.

---

## 6. Cost Over Time Projection (at €2.08/L)

| Period | Nissan Pixo | Mercedes (14 L/100km worst case) | Mercedes (10 L/100km realistic) |
|---|---|---|---|
| 1 month | **€96** | €195 | €139 |
| 6 months | **€574** | €1,172 | €835 |
| 1 year | **€1,148** | €2,344 | €1,670 |
| 3 years | **€3,444** | €7,032 | €5,010 |
| 5 years | **€5,740** | €11,720 | €8,350 |

---

## 7. Bonus: Toyota Corolla 2012 — Was It Worth Buying? (Fatima's Car)

This car was bought and resold. Full financial breakdown:

| Item | Amount |
|---|---|
| Purchase price | €7,800 |
| Additional purchase costs | +€200 |
| Repairs & fixes (4 events) | +€82 |
| Supplies (coolant, brake oil, etc.) | +€21 |
| Oil changes (×2) | +€64 |
| Wheel work | +€13 |
| **Total money invested** | **€8,180** |
| Sold for | €6,500 |
| **Net loss** | **€1,680** |

- Owned for approximately **14 months** (July 2023 – ~September 2024)
- Effective depreciation cost: **€120/month** (not counting fuel)
- The spreadsheet rounds this to a €1,500 loss using a simplified €8,000 total spend

**Verdict:** Normal outcome for a used car in this age/price bracket. The maintenance costs (€180 total) were modest, but the car lost €1,300 in market value during the 14 months of ownership.

---

## 8. Summary Comparison

| | Nissan Pixo 2009 | Mercedes A150 2005 |
|---|---|---|
| Efficiency vs factory | Right on track ✅ | Way above (short-trip skew) ⚠️ |
| Efficiency vs real owners | Normal ✅ | Above worst-case owner reports ⚠️ |
| Annual liters (spreadsheet) | 552 L/year | Too early to calculate |
| **Annual fuel cost (€2.08/L)** | **€1,148/year (€96/month)** | **€1,670–2,344/year (€139–195/month)** |
| Cost per km | €0.138 | €0.208–0.292 |
| Data reliability | High — 3 fill-ups, 59 days ✅ | Low — 1 fill-up, 10 days ⚠️ |

---

## 9. Recommendations

1. **Log 4–5 more Mercedes fill-ups** — especially include a longer drive (100+ km in one go) to get a highway reading. The current 14 L/100km will likely drop significantly.
2. **Get the Mercedes serviced.** At 178,000 km, basic maintenance (air filter, spark plugs, fuel injector cleaner) could recover 1–2 L/100km, saving up to **€200–400/year**.
3. **Budget conservatively for now.** Until the Mercedes data settles, plan for at least **€140–150/month in fuel** rather than €96 you were used to with the Pixo.
4. **Fix the spreadsheet formulas** — the Mercedes yearly cost cell is anchored to the Pixo's rows, so it's giving a mixed/incorrect result. Each car's yearly estimate should reference only its own fill-up rows.
