
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
