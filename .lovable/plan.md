

# Update Default Chart of Accounts Template

## What Changes

### 1. Update `create-tenant` Edge Function
Replace the current 15-account seed list with the full US-standard template (approximately 30 accounts), organized by liquidity preference:

- **Assets (1000s)**: Cash & Equivalents, AR, Allowance for Doubtful Accounts, Inventory, Prepaid Expenses, Fixed Assets (PP&E), Accumulated Depreciation
- **Liabilities (2000s)**: AP, Accrued Liabilities, Deferred Revenue, Notes Payable, Sales Tax Payable
- **Equity (3000s)**: Common Stock, Additional Paid-in Capital, Retained Earnings, Owner's Draw / Dividends
- **Revenue (4000s)**: Sales Revenue, Service Revenue, Sales Returns & Allowances
- **COGS (5000s)**: Purchases, Freight-In, Direct Labor (mapped to `expense` type)
- **Operating Expenses (6000-7999)**: Payroll, Rent/Lease, Utilities, Marketing, Office Supplies, Depreciation Expense
- **Other Income/Expenses (8000-9999)**: Interest Income (`revenue`), Interest Expense (`expense`), Gain/Loss on Sale of Assets (`expense`)

Each account will include the `description` field from the user's template.

### 2. Enum Mapping
The current `account_type` enum has 5 values: `asset`, `liability`, `equity`, `revenue`, `expense`. No schema change needed — COGS and operating expenses both map to `expense`, and interest income maps to `revenue`.

### 3. Update ChartOfAccounts Page Display
Update the `typeColors` map to visually distinguish account ranges in the table (no code-level grouping change needed since the accounts are already sorted by `code`).

### Technical Note
- The new seed only applies to **newly created tenants**. Existing tenants keep their current accounts.
- The edge function `create-tenant` will be redeployed automatically.

