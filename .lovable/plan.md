

# Year-End Closing Function

## What It Does
Creates a closing journal entry that zeros out all revenue and expense accounts (temporary accounts) for a fiscal year, transferring the net income/loss to the **Retained Earnings** equity account (code 3200). This is standard accounting practice at year-end.

## Where It Lives
Add a "Close Year" section to **DashboardSettings.tsx** (in the Danger Zone area), with a year selector and confirmation dialog. The closing entry is a regular posted journal entry with a special description like `"Year-End Closing — FY 2025"`.

## How It Works

1. **User selects a fiscal year** to close (dropdown of available years based on existing journal entries)
2. **Confirmation dialog** warns this will create a closing journal entry
3. **On confirm**, the system:
   - Fetches all revenue and expense accounts for the tenant
   - Calculates each account's balance for the fiscal year period (using fiscal_year_end from tenant settings to determine start/end dates)
   - Finds the Retained Earnings account (code 3200)
   - Creates a single journal entry dated on the last day of the fiscal year with status `posted`
   - Creates journal lines that zero out each revenue/expense account:
     - Revenue accounts (credit-normal): debit each for its balance
     - Expense accounts (debit-normal): credit each for its balance
     - Net difference goes to Retained Earnings
4. **Prevents duplicate closing**: checks if a closing entry already exists for that year (by description pattern match)

## Technical Details

### No database changes needed
Uses existing `journal_entries` and `journal_lines` tables.

### Files to change

| File | Change |
|------|--------|
| `src/pages/dashboard/DashboardSettings.tsx` | Add "Close Fiscal Year" UI section with year selector + AlertDialog + closing logic |

### Closing Entry Logic (pseudocode)
```
fiscalYearStart = tenant.fiscal_year_end month + 1 of selected year - 1
fiscalYearEnd = tenant.fiscal_year_end month last day of selected year

For each revenue account: debit the balance (zeroing it)
For each expense account: credit the balance (zeroing it)
Retained Earnings line = net income (revenue - expenses)
  If net income > 0: credit Retained Earnings
  If net loss: debit Retained Earnings
```

### Duplicate Prevention
Before creating, query journal_entries for description matching `Year-End Closing — FY {year}`. If found, show error toast and abort.

### Fiscal Year Date Calculation
Uses `fiscal_year_end` from tenant settings (month number 1-12). E.g., if fiscal_year_end = 12:
- FY 2025 = Jan 1, 2025 to Dec 31, 2025

If fiscal_year_end = 3:
- FY 2025 = Apr 1, 2024 to Mar 31, 2025

