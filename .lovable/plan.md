

## Problem

Parent account balances include their **own** journal line totals in addition to the sum of their children. For example, if journal entries are posted directly to account 2010 (Accounts Payable) AND to its child 2010.01, the parent shows `own_lines + child_balance` instead of just the sum of children.

The user expects: **parent balance = sum of all descendant balances only**. A parent account should act purely as an aggregator when it has children.

## Solution

Change the roll-up logic in `src/pages/dashboard/ChartOfAccounts.tsx` so that:
- **Leaf accounts** (no children): display their own journal line balance as today
- **Parent accounts** (has children): display **only** the sum of their children's rolled-up balances, ignoring any journal lines posted directly to the parent

### Change

In the `accountBalances` `useMemo` block (~line 149), update `computeNodeBalance`:

```typescript
function computeNodeBalance(node: AccountNode): number {
  const childSum = node.children.reduce((s, c) => s + computeNodeBalance(c), 0);
  // If this node has children, balance = children sum only (parent is aggregator)
  // If leaf, balance = own journal lines
  const total = node.children.length > 0 ? childSum : (ownBalances[node.id] ?? 0);
  rolled[node.id] = total;
  return total;
}
```

### File to change
- `src/pages/dashboard/ChartOfAccounts.tsx` — one line change in the `computeNodeBalance` function

