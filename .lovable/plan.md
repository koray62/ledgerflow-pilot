

## Problem

When a CSV-imported transaction matches an invoice (e.g. LP2026000102), the auto-payment logic creates journal lines using `s.debitAccountId` as the bank Chart of Account. However, when the AI returns a **multi-line suggestion** (revenue with VAT using the `lines` array), `debitAccountId` is not populated — it's only set for simple 2-line entries. This results in journal lines being created with a null/undefined `account_id`, producing an empty or broken journal entry.

The screenshot confirms this: the Edit Journal Entry form shows the correct description ("Payment received for Invoice LP2...") but the journal lines have no accounts or amounts populated.

## Root Cause

In `BankAccounts.tsx` line 503:
```typescript
const bankCoAId = s.debitAccountId; // undefined for multi-line suggestions
```

For incoming payments (positive amounts), the AI generates multi-line entries (bank debit, revenue credit, VAT credit) using the `lines` array. In that format, `debitAccountId` is omitted. The invoice-matching code then uses this empty value for the bank account in the payment journal entry.

## Fix

In the `approveEntry` function, when `isInvoicePayment` is true, resolve the bank CoA account ID reliably:

1. First try `s.debitAccountId` (simple entry format).
2. If empty, look through `s.lines` for the line with a non-zero `debit` — that's the bank account line.
3. If still not found, fall back to finding the bank account from `chartAccounts` by matching the selected `importAccountId` bank account, or by looking for an account with type "asset" and name containing "bank" or "cash".

### Code Change (single location in `BankAccounts.tsx`)

Replace the `bankCoAId` assignment (around line 503) with:

```typescript
// Resolve bank CoA: prefer debitAccountId, fall back to debit line in multi-line suggestion
let bankCoAId = s.debitAccountId;
if (!bankCoAId && s.lines?.length) {
  const debitLine = s.lines.find((l) => l.debit > 0);
  if (debitLine) bankCoAId = debitLine.accountId;
}
```

This ensures that even when the AI uses the `lines` array format, the invoice payment journal entry correctly identifies and uses the bank account.

