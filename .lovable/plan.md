

## Plan: Dual-Mode Accounting (Cash vs Accrual Basis)

### Overview
Add an "Accounting Basis" setting (Cash / Accrual) to settings, then adjust Income Statement and Cash Flow calculations accordingly.

### 1. Database Migration
Add `accounting_basis` column to `tenants` table:
```sql
ALTER TABLE public.tenants ADD COLUMN accounting_basis text NOT NULL DEFAULT 'accrual';
```
This avoids using the untyped `settings` JSONB and keeps it explicit.

### 2. Settings UI (`DashboardSettings.tsx`)
- Add state `accountingBasis` initialized from tenant data
- Add a new "Accounting Method" section (or inline in Organization card) with a RadioGroup: **Accrual Basis** / **Cash Basis**, each with a short description
- Include in `handleSave` update payload

### 3. Tenant Context (`useTenant.tsx`)
- Add `accountingBasis: string` to context type (default `"accrual"`)
- Fetch it alongside `default_currency` from tenants table
- Expose via `useTenant()`

### 4. Income Statement (`IncomeStatement.tsx`)

**Accrual mode** (current behavior, mostly correct):
- Filter by `entry_date` on posted journal entries
- Include all revenue/expense accounts as-is

**Cash mode**:
- Instead of fetching all posted journal entries in the date range, only consider journal lines that touch cash accounts (code 1010 or parent 1000 descendants)
- For each cash-touching journal line, find the **counter-party** line on the same journal entry to identify the revenue/expense account
- Revenue = credits to cash account's counter-entry on revenue accounts; Expenses = debits from cash account's counter-entry on expense accounts
- Exclude AR (1100) and Deferred Revenue (2200) from display entirely
- Add a basis indicator badge in the header

**Implementation approach**: Add a second query path in `fetchLineTotals` that:
1. Gets posted journal entries in date range
2. Gets journal lines on cash accounts for those entries
3. For each cash-account line, fetches the sibling lines to attribute amounts to revenue/expense accounts
4. Returns synthetic line totals keyed by the revenue/expense account

### 5. Cash Flow (`CashFlow.tsx`)

**Accrual mode (Indirect Method)**:
- Start with Net Income from P&L
- Add section: "Adjustments for non-cash items"
- Calculate change in AR (1100) and Deferred Revenue (2200) between period start and end
- Net Cash = Net Income + Change in Deferred Revenue - Change in AR
- Display adjustments in the monthly breakdown

**Cash mode** (simplified):
- Current behavior is essentially correct (tracks cash account movements)
- Net Income ≈ Net Cash from Operations
- Simplify display: remove AR/AP adjustment sections, show direct cash movements only

### 6. UI Additions
- Both Income Statement and Cash Flow headers get a small badge showing current basis ("Accrual" / "Cash")
- Cash-mode P&L hides any AR balance display

### Files Changed
| File | Change |
|------|--------|
| `supabase/migrations/` | New migration adding `accounting_basis` column |
| `src/hooks/useTenant.tsx` | Expose `accountingBasis` |
| `src/pages/dashboard/DashboardSettings.tsx` | Accounting basis RadioGroup + save |
| `src/pages/dashboard/IncomeStatement.tsx` | Dual-mode P&L logic |
| `src/pages/dashboard/CashFlow.tsx` | Dual-mode cash flow logic |

### Key Validation Rules
- Cash Basis P&L never shows AR or Deferred Revenue balances
- Accrual Basis uses journal entry date for filtering
- Cash Basis uses transaction date on cash accounts (1010) for filtering

