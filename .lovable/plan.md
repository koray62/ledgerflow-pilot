## Plan: Fix Three Issues — Cash Flow Double-Count, Invoice Filter, Accrual Revenue

### Issue 1: Recurring expense double-counted in first month (CashFlow.tsx)

**Root cause**: When a recurring journal entry is created, the system creates both a `forecast_entry` (for future months) AND a `journal_entry` for the current month. In the cash flow's future-month logic, both `futureCashJournalLines` and `forecasts` are iterated — so the first month gets the amount from both sources.

**Fix**: In the future-month block (~lines 386-412), for each forecast that is recurring and monthly, check if a corresponding journal entry already exists in `futureCashJournalLines` for that month. If it does, skip the forecast to avoid double-counting. This can be done by checking if a journal line with a matching description/amount exists in the same month before applying the forecast.

Alternative simpler approach: for the forecast start month specifically, skip the recurring forecast since the actual journal entry already covers it.

### Issue 2: "Overdue" filter should include "late" invoices (Invoices.tsx)

**Root cause**: Line 676 filters by `inv.status === statusFilter`, but "late" is a virtual display status — the DB stores "sent" or "overdue". When the user selects "Overdue" filter, invoices with DB status "sent" but past due (displayed as "late") are excluded.

**Fix**: Change the filter logic to use `getDisplayStatus(inv)` instead of `inv.status` when comparing against the status filter. Also map "overdue" filter to match both "overdue" and "late" display statuses.

**Changes in `Invoices.tsx**`:

- Update filter (line 676): `const matchStatus = statusFilter === "all" || getDisplayStatus(inv) === statusFilter;`  
- Make sure "Overdue" to also match "late"

### Issue 3: Accrual basis — Invoice should recognize Revenue immediately, not Deferred Revenue (Invoices.tsx)

**Root cause**: The current accrual-mode journal entry on invoice creation (lines 455-484) does:

- DR Accounts Receivable / CR **Deferred Revenue** / CR VAT

But correct accrual accounting says: revenue is recognized when the invoice is issued, regardless of payment. The entry should be:

- DR Accounts Receivable / CR **Revenue** / CR VAT

Additionally, the payment recording (lines 570-587) currently does:

- CR Revenue / DR AR (wrong — revenue was already recognized)

It should be:

- DR Bank / CR AR (clearing the receivable)

**Changes in `Invoices.tsx**`:

1. **handleSave** accrual branch (line 455): Change `deferredRevenueAccount` to the first revenue account, CR Revenue instead of CR Deferred Revenue
2. **handleRecordPayment** (line 570): Change to DR Bank (the selected account), CR AR — the payment simply clears the receivable, no revenue entry needed

### Files Modified

- `src/pages/dashboard/CashFlow.tsx` — deduplicate recurring forecasts vs journal entries in first month
- `src/pages/dashboard/Invoices.tsx` — fix status filter, fix accrual journal entries, fix payment recording