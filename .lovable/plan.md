

## Add YoY Percentage Change Indicators

### Overview
Show a small percentage change badge below each comparison year's amount, comparing it to the previous year's value (i.e., each year compared to the year before it).

### Logic
Add a helper function:
```typescript
const pctChange = (current: number, previous: number): string | null => {
  if (previous === 0) return current === 0 ? null : "+∞";
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
};
```

For each comparison column, compute the % change relative to the column to its left (current year vs year-1, year-1 vs year-2, year-2 vs year-3).

### Display
Below each dollar amount in comparison columns, render a small colored label:
- Green for positive change, red for negative change
- `text-[10px]` size, no extra row — just a `<div>` under the amount in the same `<td>`

### Changes in `src/pages/dashboard/IncomeStatement.tsx`

1. **Add `pctChange` helper** — returns formatted string or null when both values are zero.

2. **Account rows** — In each comparison `<td>`, after the amount `<span>`, add a small `<div>` showing the % change. The "reference" value chain: current year → compBalances[0] → compBalances[1] → compBalances[2]. So compBalances[0] compares against current, compBalances[1] against compBalances[0], etc.

3. **Section total rows** — Same treatment for section totals.

4. **Summary card** — Same treatment for Total Revenue, Total Expenses, and Net Income rows.

