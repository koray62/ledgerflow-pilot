

## Fix Percentage Change Logic in Income Statement

### Problem
1. The current year column (2026) shows no percentage change — it should show YoY change vs 2025
2. The oldest comparison year (2023) shows a percentage change — it shouldn't, since there's no prior year data
3. The comparison direction is wrong: each column's % change should be calculated relative to the year *after* it (the older year), not the year before it

### Current Logic (lines 329-340)
- Current year (`balance`): No `PctBadge` rendered
- `compBalances[0]` (2025): compares against `balance` (2026) — wrong direction
- `compBalances[1]` (2024): compares against `compBalances[0]` (2025)
- `compBalances[2]` (2023): compares against `compBalances[1]` (2024) — should have no comparison

### Fix
**For the current year column**: Add a `PctBadge` comparing current year against `compBalances[0]` (the next older year).

**For comparison columns**: Each column at index `i` should compare against `compBalances[i+1]` (the older year). The last comparison column (oldest year) should show no percentage change.

This applies in 3 places:
1. **Account rows** (lines ~322-340): Add PctBadge to current year cell; fix comparison column logic
2. **Section total rows** (lines ~350-365): Same fix
3. **Summary table** (lines ~390-440): Same fix for Revenue/Expenses/Net Income totals

### File Changed
- `src/pages/dashboard/IncomeStatement.tsx`

