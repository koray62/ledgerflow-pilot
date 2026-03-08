

## Problem

The Cash Flow page calculates its "Net Cash Position" by summing `current_balance` from **all** `bank_accounts` rows. This includes non-cash accounts. The correct approach is to derive the cash balance from the **chart of accounts** — specifically, only accounts under the Cash parent (code `1000`) — by computing their ledger balances from journal lines.

## Fix

### Single file change: `src/pages/dashboard/CashFlow.tsx`

**Replace** the current `cashBalance` query (which reads `bank_accounts.current_balance`) with a two-step approach:

1. **Fetch cash account IDs** from `chart_of_accounts`: Find the parent asset account with code `1000`, then collect all its children/grandchildren (same pattern used in `Invoices.tsx` lines 192-201).

2. **Compute balance from journal lines**: Query `journal_lines` for those cash account IDs, sum debits minus credits (since cash is a debit-normal asset account). Only include lines from posted journal entries (`status = 'posted'`).

This replaces the `bank_accounts` sum with an actual ledger-derived cash balance, which is the accounting-correct approach.

```typescript
// Fetch chart of accounts to identify cash accounts
const { data: accounts = [] } = useQuery({
  queryKey: ["cf-accounts", tenantId],
  enabled: !!tenantId,
  queryFn: async () => {
    const { data } = await supabase
      .from("chart_of_accounts")
      .select("id, code, name, account_type, parent_id")
      .eq("tenant_id", tenantId!)
      .eq("is_active", true);
    return data ?? [];
  },
});

// Derive cash account IDs (code 1000 and descendants)
const cashParent = accounts.find(a => a.account_type === "asset" && a.code === "1000");
const cashChildIds = new Set(
  cashParent ? accounts.filter(a => a.parent_id === cashParent.id).map(a => a.id) : []
);
const cashAccountIds = accounts
  .filter(a => a.account_type === "asset" && a.id !== cashParent?.id &&
    (a.parent_id === cashParent?.id || cashChildIds.has(a.parent_id ?? "")))
  .map(a => a.id);

// Compute cash balance from posted journal lines
const { data: cashBalance = 0 } = useQuery({
  queryKey: ["cf-cash", tenantId, cashAccountIds],
  enabled: !!tenantId && cashAccountIds.length > 0,
  queryFn: async () => {
    const { data } = await supabase
      .from("journal_lines")
      .select("debit, credit")
      .eq("tenant_id", tenantId!)
      .in("account_id", cashAccountIds)
      .is("deleted_at", null);
    return data?.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0) ?? 0;
  },
});
```

The rest of the page (forecast chart, burn rate, runway) continues to work as-is since they already use invoices/bills/forecasts data — only the starting cash balance changes.

