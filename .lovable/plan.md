

## Update: Invoice Auto-Matching Status Condition

### Change
In the previously approved plan for auto-matching CSV transactions to invoices, update the invoice lookup condition:

**Before:** Look up invoices where `status = 'sent'`
**After:** Look up invoices where `status = 'sent'` OR `status = 'overdue'`

### Implementation Detail

In `src/pages/dashboard/BankAccounts.tsx`, when implementing the `approveEntry` invoice auto-matching logic:

1. **Fetch query** — Query unpaid invoices with `.in('status', ['sent', 'overdue'])` instead of `.eq('status', 'sent')`.
2. **Match check** — The matching logic (regex for invoice number + amount comparison) remains identical; it just operates on a wider pool of candidate invoices.

This is a one-line filter change. Everything else in the approved plan stays the same.

