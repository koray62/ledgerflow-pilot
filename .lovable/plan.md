

## Problem

Recurring forecast entries have **amount = 0** in the database. This is because the `JournalEntryForm` calculates the forecast amount as `debit - credit` across all lines (line 315), which always nets to zero for a balanced journal entry.

## Root Cause

```typescript
// JournalEntryForm.tsx line 315
const netAmount = lineRows.reduce((s, l) => s + l.debit - l.credit, 0);
// For a balanced entry: total debits == total credits → netAmount = 0
```

## Fix

The forecast amount should represent the **total expense or revenue value**, not the net of a balanced entry. The correct approach is to use the **total debits** (for expense entries) or **total credits** (for revenue entries) as the forecast amount:

1. **In `JournalEntryForm.tsx`** — Replace the net calculation with:
   - `totalDebit = sum of all debit values`
   - `totalCredit = sum of all credit values`
   - If `totalDebit >= totalCredit`: category is `expense`, amount = `totalDebit`
   - Else: category is `revenue`, amount = `totalCredit`

2. **Fix existing data** — Run a migration to update the 3 existing forecast entries with zero amounts. We can recalculate from the linked journal entry's lines, or prompt the user to re-enter. Since we can't reliably link forecast entries back to journal entries (no FK), we'll need to either:
   - Add a note that existing zero-amount entries need manual correction, OR
   - Attempt to match by description/date and fix them

## Plan

- **Fix the formula** in `JournalEntryForm.tsx` line 315 so new recurring entries get the correct amount
- **Display the amount column** in the CashFlow forecast table using `formatCurrency(Math.abs(entry.amount), currency)` so it shows properly even for negative values

