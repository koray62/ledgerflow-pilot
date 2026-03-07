

## Remove VAT Lines When Sales Revenue Account is Changed

### Problem
When the AI identifies a transaction as sales revenue, it creates a 3-line entry (Bank debit, Revenue credit, VAT Payable credit). If the user changes the revenue account to a non-revenue account during review, the VAT line remains — creating an incorrect entry that the user cannot fix.

### Solution
When a user changes a credit account in a multi-line (VAT-split) entry, detect whether the new account is still a revenue account. If not, collapse the entry back to a simple 2-line format (debit + credit) with the full gross amount, removing the VAT line.

### How it works

1. **Detect revenue accounts** using `account_type === 'revenue'` from the `chart_of_accounts` data already loaded in `chartAccounts`.

2. **On credit account change** in a multi-line entry: check if the newly selected account is a revenue type.
   - **Still revenue**: keep the 3-line VAT structure as-is (just swap the account).
   - **No longer revenue**: collapse `lines` to `undefined`, set `debitAccountId` to the bank/debit line's account, set `creditAccountId` to the newly selected account, and keep `amount` as the gross total.

3. **Reverse case** (optional but useful): when a simple 2-line entry's credit account is changed TO a revenue account, auto-expand into a 3-line VAT split (calculate net = amount/1.20, VAT = amount - net).

### File to change
- `src/pages/dashboard/BankAccounts.tsx` — update the `onValueChange` handler for credit-side account selects within multi-line entries (~line 729), and optionally the simple credit account select (~line 749).

