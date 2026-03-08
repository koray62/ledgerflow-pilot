

## Updated Plan: Multi-Currency Support

The current plan covers amount direction indicators for bank CSV imports. Below is the full updated plan that adds comprehensive multi-currency support.

---

### Part 1 — Amount Direction Indicators (existing)

No changes to this section. See current plan for details on color coding and prefix indicators in `BankAccounts.tsx`.

---

### Part 2 — Multi-Currency Support

#### Supported Currencies
USD, EUR, AED, TRY (Turkish Lira), SAR (Saudi Riyal)

#### Database Changes
1. Add `default_currency text NOT NULL DEFAULT 'USD'` to `tenants`
2. Add `currency text NOT NULL DEFAULT 'USD'` to `journal_entries`
3. Add `currency text NOT NULL DEFAULT 'USD'` to `invoices`
4. `bank_accounts` already has a `currency` column

#### Shared Utility (`src/lib/utils.ts`)
- Add `SUPPORTED_CURRENCIES` constant array with code, label, symbol
- Add `formatCurrency(amount, currencyCode)` using `Intl.NumberFormat`
- All files currently using local `fmt()` functions will import this shared utility

#### Settings (`DashboardSettings.tsx`)
- Add "Default Currency" dropdown in Organization section
- Saves to `tenants.default_currency`

#### Tenant Context (`useTenant.tsx`)
- Expose `defaultCurrency` from tenant record so all components can access it

#### Forms — Currency Selector
- **JournalEntryForm**: Add currency dropdown, default to tenant currency, save to `journal_entries.currency`
- **Invoices**: Add currency dropdown in create/edit dialog, default to tenant currency, save to `invoices.currency`, show in preview/PDF
- **BankAccounts**: Expand existing currency dropdown to all 5 options

#### Bank → Journal Entry Validation
- When approving CSV-imported suggestions, set journal entry currency = bank account currency
- Show error toast if a manual mismatch is detected

---

### Part 3 — Financial Statements & Multi-Currency

This is the key addition. Financial statements aggregate journal lines across potentially different currencies. The approach:

#### Design Decision: Single-Currency Reporting
Financial statements (Balance Sheet, Income Statement, Cash Flow, Performance Analysis) will **report in the tenant's default currency only**. Journal entries in foreign currencies are recorded at the entry-time amount (no live FX conversion). This is standard for small-business accounting — the entry already captures the converted amount in journal lines (debits/credits are always in the reporting currency).

#### Why This Works
- Journal lines store absolute debit/credit amounts — these are already denominated in the functional currency at entry time
- The `currency` field on `journal_entries` and `invoices` is metadata for the *transaction* currency, not the reporting currency
- Double-entry debits and credits remain balanced regardless of the original transaction currency

#### What Changes in Statements

| Report | Change |
|--------|--------|
| **Balance Sheet** | Replace local `fmt()` with `formatCurrency(amount, defaultCurrency)` so the correct symbol displays |
| **Income Statement** | Same — use `formatCurrency` with tenant default currency |
| **Cash Flow** | Same — use `formatCurrency` with tenant default currency |
| **Performance Analysis** | Same — use `formatCurrency` with tenant default currency, including PDF export |
| **Dashboard Overview** | Same — KPI cards use tenant default currency |
| **Journal Entries list** | Show entry's own currency badge next to amount when it differs from default |
| **Invoice list/preview** | Show invoice's own currency in preview and PDF |

#### Currency Badge on Mixed-Currency Views
In the Journal Entries table and Bank Transactions table, entries whose currency differs from the tenant default will show a small badge (e.g., `EUR`) next to the amount, making it clear which entries are in foreign currencies.

#### Future Enhancement (out of scope now)
- Multi-currency FX rate table for automatic conversion
- Unrealized gain/loss calculations
- Currency revaluation entries

---

### Files to Change (Complete List)

| File | Changes |
|------|---------|
| **Migration SQL** | Add columns to `tenants`, `journal_entries`, `invoices` |
| `src/lib/utils.ts` | `SUPPORTED_CURRENCIES`, `formatCurrency()` |
| `src/hooks/useTenant.tsx` | Add `defaultCurrency` to context |
| `src/pages/dashboard/DashboardSettings.tsx` | Currency selector |
| `src/components/dashboard/JournalEntryForm.tsx` | Currency dropdown + save |
| `src/pages/dashboard/Invoices.tsx` | Currency dropdown + preview/PDF |
| `src/pages/dashboard/BankAccounts.tsx` | Direction indicators + expand currency options + validation |
| `src/pages/dashboard/BalanceSheet.tsx` | Use `formatCurrency(n, defaultCurrency)` |
| `src/pages/dashboard/IncomeStatement.tsx` | Use `formatCurrency(n, defaultCurrency)` |
| `src/pages/dashboard/CashFlow.tsx` | Use `formatCurrency(n, defaultCurrency)` |
| `src/pages/dashboard/PerformanceAnalysis.tsx` | Use `formatCurrency(n, defaultCurrency)` + PDF |
| `src/pages/dashboard/DashboardOverview.tsx` | Use `formatCurrency(n, defaultCurrency)` |
| `src/pages/dashboard/JournalEntries.tsx` | Currency badge for foreign entries |
| `src/pages/dashboard/ChartOfAccounts.tsx` | Use `formatCurrency` |
| `src/pages/dashboard/OCRUpload.tsx` | Use `formatCurrency` |
| `supabase/functions/process-bank-csv/index.ts` | Pass bank account currency in AI prompt |

