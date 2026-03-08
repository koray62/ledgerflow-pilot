

## Account Detail View + Edit/Delete for Chart of Accounts

### Overview
Three features to add to `src/pages/dashboard/ChartOfAccounts.tsx`:

1. **Click-to-view transaction ledger** — clicking a row opens a detail panel/dialog showing all journal lines (debits and credits) for that account
2. **Edit account** — edit code, name, description, type (if no parent), parent
3. **Delete account** — soft-delete, only allowed when the account's rolled-up balance is zero AND it has no children with balances

### Changes — single file: `src/pages/dashboard/ChartOfAccounts.tsx`

#### 1. Account Detail Dialog (Transaction Ledger)
- Add state: `selectedAccountId`
- Clicking a row sets `selectedAccountId` (not the collapse toggle or action buttons)
- Open a `Sheet` (side panel, right) showing:
  - Account header: code, name, type badge, total balance
  - Table of journal lines for that account, fetched via `useQuery` keyed on `selectedAccountId`:
    ```sql
    SELECT jl.*, je.entry_date, je.description as entry_description, je.entry_number
    FROM journal_lines jl
    JOIN journal_entries je ON jl.journal_entry_id = je.id
    WHERE jl.account_id = ? AND jl.tenant_id = ? AND jl.deleted_at IS NULL AND je.deleted_at IS NULL
    ORDER BY je.entry_date DESC
    ```
  - Columns: Date, Entry #, Description, Debit, Credit, Running Balance
- Uses the `Sheet` component from `@/components/ui/sheet`

#### 2. Edit Account
- Add state: `editingAccount: Account | null`
- Reuse the existing Add Account dialog — when `editingAccount` is set, pre-fill form fields and change title to "Edit Account"
- On save: call `supabase.from("chart_of_accounts").update(...)` instead of insert
- Duplicate code validation should exclude the account being edited
- Add an Edit (Pencil) icon button next to the existing Plus button in the actions column (visible on hover)

#### 3. Delete Account
- Add a Trash icon button in the actions column (visible on hover)
- Before delete, check:
  - `accountBalances[id] === 0` (rolled-up balance is zero)
  - Account has no children (or all children also have zero balance)
- If balance != 0: show toast error "Cannot delete: account has a non-zero balance"
- If has children: show toast error "Cannot delete: account has sub-accounts"
- If allowed: show `AlertDialog` confirmation, then soft-delete via `supabase.from("chart_of_accounts").update({ deleted_at: new Date().toISOString() })`
- Invalidate queries after delete

#### UI Layout for Actions Column
Current: just the Plus button. New: a small dropdown or inline icon group with Edit (Pencil), Delete (Trash), Add Sub (Plus) — all visible on row hover.

