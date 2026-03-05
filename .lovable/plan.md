

## Problem

When the AI suggests journal entries from CSV bank transactions, it only receives the chart of accounts. It has no knowledge of registered vendors or customers, so it cannot match transaction descriptions like "Incoming transfer from Monai Finansal" to a known customer and correctly assign Sales Revenue (4010).

## Solution

Pass the tenant's vendor and customer lists alongside the chart of accounts to the AI edge function, and enhance the system prompt to use them for smarter account mapping.

### Changes

**1. `src/pages/dashboard/BankAccounts.tsx`** (client-side)
- Fetch vendors and customers for the current tenant (already have `chartAccounts` query pattern to follow).
- Pass `vendors` and `customers` arrays in the request body to `process-bank-csv`.

**2. `supabase/functions/process-bank-csv/index.ts`** (edge function)
- Accept `vendors` and `customers` from the request body.
- Add them to the system prompt, instructing the AI:
  - If a transaction description mentions a known **customer** name, treat it as revenue (e.g., credit 4010 Sales Revenue).
  - If a transaction description mentions a known **vendor** name, treat it as an expense mapped to the vendor's typical expense category.
  - Include the vendor/customer name lists with their IDs so the AI can reference them.

### Prompt addition (summary)

```
Here are the registered vendors (suppliers):
[{name, id}, ...]

Here are the registered customers:
[{name, id}, ...]

IMPORTANT: When a transaction description contains or closely matches a vendor name, 
classify it as an expense/payment to that vendor. When it contains or closely matches 
a customer name, classify it as revenue/income from that customer.
```

### Files to change
- `src/pages/dashboard/BankAccounts.tsx` — fetch vendors + customers, pass to edge function
- `supabase/functions/process-bank-csv/index.ts` — accept and include vendor/customer data in AI prompt

