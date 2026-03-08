

## Problem

In the "Review & Approve Journal Entries" table, the Amount column shows plain numbers (e.g., `50000`, `4.22`, `308.3`) without any sign indicator. Since journal entries always use absolute amounts (debit/credit accounts indicate direction), users can't tell at a glance whether the original transaction was an inflow or outflow.

## Solution

Enhance the Amount column in the suggestions review table to clearly indicate the direction of the original transaction:

1. **Color coding**: Green for inflows (credits/positive original amounts), red for outflows (debits/negative original amounts)
2. **Prefix indicators**: Show `▲` or `+` for inflows and `▼` or `−` for outflows next to the amount
3. **Apply to both states**: The pending (editable input) and approved (read-only span) views should both show the direction indicator

### Technical approach

- Each suggestion object already has `originalTx.amount` which preserves the sign from the CSV. Use this to determine direction.
- For the **read-only** display: format with color + arrow prefix based on `originalTx.amount` sign
- For the **editable input**: add a colored badge/label next to the input showing the direction (e.g., a small "IN" or "OUT" badge), since the input itself shows the absolute journal amount
- Apply similar treatment to the raw transaction preview table (line ~547) which already has color but could benefit from clearer `+`/`-` prefixes

### Files to change

- `src/pages/dashboard/BankAccounts.tsx` — Update the Amount cells in both the transaction preview table and the journal entry review table to include direction indicators and consistent color coding

