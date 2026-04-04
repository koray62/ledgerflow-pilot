

## Plan: Fix Recurring Forecast Double-Count in First Month

### Root Cause
The current dedup logic (CashFlow.tsx lines 426-432) tries to match a recurring forecast against `futureCashJournalLines` by amount in the start month. This fails when:
- The journal entry doesn't hit a cash account (e.g., accrual entries using AP instead of cash)
- Amount comparison has floating-point mismatches
- The journal entry has multiple lines on cash accounts

Since the forecast's start month always has a corresponding journal entry (created at the same time), the forecast should simply be skipped entirely for that month.

### Fix (CashFlow.tsx)

**Lines 426-432** — Replace the fragile amount-matching dedup with a simple unconditional skip for the start month:

```typescript
if (currentEvalMonth.getTime() === forecastStartMonth.getTime()) {
  return; // Journal entry already covers the start month
}
```

This removes ~6 lines of `futureCashJournalLines.some(...)` matching and replaces with a single `return`.

### Files Modified
- `src/pages/dashboard/CashFlow.tsx` — simplify dedup to always skip recurring forecast in start month

