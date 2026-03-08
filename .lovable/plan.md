

## Plan: Replace Bank Account Selector with Chart of Accounts Asset Selector

### Problem
The payment recording dialog currently selects from the `bank_accounts` table, then separately searches for a chart of accounts entry by name keyword "bank" — which fails for non-English account names.

### Solution
Replace the bank account dropdown with a **chart of accounts selector** filtered to sub-accounts under code `1000` (Cash and Cash Equivalents / Assets). The user directly picks the GL account (e.g., "1010 — TEB Vadesiz TL") that should be debited.

### Changes in `src/pages/dashboard/Invoices.tsx`

1. **Rename state**: `paymentBankId` now stores a **chart_of_accounts ID** instead of a bank_accounts ID.

2. **Filter accounts for dropdown**: From the already-fetched `accounts` array, filter to `account_type === "asset"` accounts whose `code` starts with `1000` or whose `parent_id` matches the `1000` parent account. This gives all cash/bank sub-accounts.

3. **Update payment dialog UI** (~lines 800-811): Replace the `bankAccounts.map()` dropdown with the filtered asset accounts, showing `code — name` for each.

4. **Update `handleRecordPayment`** (~lines 405-470): Remove the `bankAcct` and `bankChartAcct` lookups. Use `paymentBankId` directly as the `account_id` for the debit journal line (since it's now already a chart_of_accounts ID).

5. **Remove `bankAccounts` query dependency** from the payment flow (the query can stay for the Bank Accounts page but is no longer needed here).

This is a ~20 line change in one file.

