

## QuickBooks-style Balance Display for Chart of Accounts

### Problem
The current roll-up logic uses `ownBalance + childSum`, but there's no visual distinction between a parent's direct entries and the rolled-up total. Users need to see both values to understand where money sits.

### Solution
For parent accounts that have both direct journal entries AND children, show a two-line balance display:
- **Total balance** (bold, primary) = own + children sum (current behavior, kept as-is)
- **Own balance** shown as a smaller secondary line underneath (e.g., "Own: $500.00") only when the parent has direct entries (own balance != 0)

Additionally, show a subtle warning icon/indicator on parent accounts that have direct entries, hinting the user should consider reclassifying those to a sub-account.

### File to change
- `src/pages/dashboard/ChartOfAccounts.tsx`

### Changes

1. **Keep existing `computeNodeBalance` as-is** — parent balance = own + children (standard accounting behavior)

2. **Expose `ownBalances` to the render** — already available in scope

3. **Update the Balance column cell** for parent accounts:
   - Show total (rolled-up) as the main number
   - If the account has children AND `ownBalances[id] !== 0`, show a second line: `"Own: $X.XX"` in smaller muted text
   - Add a small warning tooltip icon next to "Own" suggesting reclassification

