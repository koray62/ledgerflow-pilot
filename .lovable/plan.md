## Multi-Currency Support — IMPLEMENTED

### Supported Currencies
USD, EUR, AED (UAE Dirham), TRY (Turkish Lira), SAR (Saudi Riyal)

### Database Changes ✅
- `tenants.default_currency` (text, NOT NULL, default 'USD')
- `journal_entries.currency` (text, NOT NULL, default 'USD')
- `invoices.currency` (text, NOT NULL, default 'USD')
- `bank_accounts.currency` already existed

### Shared Utility (`src/lib/utils.ts`) ✅
- `SUPPORTED_CURRENCIES` constant with code, label, symbol
- `formatCurrency(amount, currency, options?)` using `Intl.NumberFormat`
- `CurrencyCode` type

### Tenant Context (`useTenant.tsx`) ✅
- `defaultCurrency` exposed from tenant record

### Settings (`DashboardSettings.tsx`) ✅
- Default Currency dropdown in Organization section

### Form Currency Selectors ✅
- **JournalEntryForm**: Currency dropdown, defaults to tenant currency, saves to `journal_entries.currency`
- **Invoices**: Currency dropdown in create/edit dialog, saves to `invoices.currency`
- **BankAccounts**: Select dropdown with all 5 currencies (replaced text input)

### Financial Statements ✅
All reports use `formatCurrency(amount, defaultCurrency)`:
- Balance Sheet, Income Statement, Cash Flow, Performance Analysis, Dashboard Overview
- Chart of Accounts, Journal Entries, OCR Upload
- Bank account balances display in account's own currency

### Design Decision: Single-Currency Reporting
- Financial statements report in tenant's default currency only
- `currency` field on journal_entries/invoices is metadata for the transaction currency
- Journal line debits/credits are always in the functional (reporting) currency

### Future Enhancements (out of scope)
- Multi-currency FX rate table
- Unrealized gain/loss calculations
- Currency revaluation entries
- Currency badge on mixed-currency views
- Bank → Journal Entry currency validation on CSV import

## Dual-Mode Accounting (Cash vs Accrual Basis) — IMPLEMENTED

### Overview
Users can choose between Cash Basis and Accrual Basis accounting. The setting affects how the Income Statement and Cash Flow reports calculate and display data.

### Database Changes ✅
- `tenants.accounting_basis` (text, NOT NULL, default 'accrual')

### Tenant Context (`useTenant.tsx`) ✅
- `accountingBasis` exposed from tenant record

### Settings (`DashboardSettings.tsx`) ✅
- Accounting Method RadioGroup with descriptions for each basis

### Income Statement (`IncomeStatement.tsx`) ✅
- **Accrual Mode**: Standard journal entry date filtering, all revenue/expense accounts
- **Cash Mode**: Only considers journal entries touching cash accounts (1000 descendants), attributes amounts to counter-party revenue/expense accounts, excludes AR (1100) and Deferred Revenue (2200) from display
- Basis badge displayed in header

### Cash Flow (`CashFlow.tsx`) ✅
- **Accrual Mode (Indirect Method)**: Starts with Net Income, adjusts for ΔAR and ΔDeferred Revenue, shows reconciliation table
- **Cash Mode**: Simplified direct cash movements, hides AR/AP adjustment sections and outstanding invoices/bills projections
- Basis badge displayed in header
- Metrics cards change based on mode

### Key Validation Rules
- Cash Basis P&L never shows AR or Deferred Revenue balances
- Accrual Basis uses journal entry date for filtering
- Cash Basis uses cash-account-touching entries only

## Accounting Help Chatbot — IMPLEMENTED

### Overview
Floating AI chatbot on all dashboard pages. Reads tenant currency + CoA from database, uses Gemini to provide accounting guidance tailored to the correct standards (TFRS, SOCPA, US GAAP, IFRS).

### Files
- `supabase/functions/accounting-help/index.ts` — Edge function with dynamic system prompt
- `src/components/dashboard/HelpChatbot.tsx` — Floating chat UI with streaming
- `src/components/dashboard/DashboardLayout.tsx` — Integration point

### Features
- Currency → standard mapping (TRY→TFRS, SAR→SOCPA, USD→US GAAP, EUR/AED→IFRS)
- Full CoA tree passed as context so model references real account codes
- Tenant name, fiscal year end, and industry included in system prompt
- Can recommend adding/editing/deleting CoA items and journal entries
- SSE streaming with token-by-token rendering
- Markdown rendering via react-markdown
- Ephemeral conversation (resets on close)
- Quick-start suggestion chips
