

## Problem

The `process-bank-csv` edge function only applies the 20% VAT split to **incoming revenue** transactions. Outgoing vendor payments (expenses) are handled as simple 2-line entries (CR Bank, DR Expense) without separating out Input VAT (VAT Recoverable).

In proper double-entry with VAT, an expense payment should split into:
- **Credit**: Bank account for the full (gross) amount
- **Debit**: Expense account for the net amount (gross / 1.20)
- **Debit**: VAT Receivable (Input VAT) for the VAT portion (gross - net)

## Changes

### 1. Update AI prompt in `supabase/functions/process-bank-csv/index.ts`

Modify the system prompt rules for "Money going OUT" to mirror the revenue VAT logic:

**Current**: Simple 2-line entry (CR Bank, DR Expense)

**New**: When money goes OUT and the debit account is an **expense** account, apply 20% VAT automatically:
- Credit: Bank account for the gross amount
- Debit: Expense account for the net amount (gross / 1.20)  
- Debit: VAT Receivable (Input VAT) account for the VAT amount (gross - net)
- Use the `lines` array format for these multi-line entries

For non-expense outflows (e.g., loan repayments, owner drawings), keep the simple 2-line format.

### 2. Client-side: No code changes needed

The `BankAccounts.tsx` approval logic already handles multi-line suggestions via `s.lines` (line 544-555), and the review UI already supports editing multi-line entries. The VAT toggle logic for dynamically adding/removing VAT lines is also already in place for revenue. So the edge function change is sufficient.

## Summary

Single file change: `supabase/functions/process-bank-csv/index.ts` — update the system prompt to instruct the AI to split vendor/expense payments into 3 lines (Expense net + Input VAT + Bank gross), mirroring how revenue transactions are already split.

