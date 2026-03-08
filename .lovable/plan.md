

## Add Journal Entry Linking from Account Ledger Sheet

### What to change
In `src/pages/dashboard/ChartOfAccounts.tsx`, make the Entry # column in the ledger sheet clickable, navigating the user to the Journal Entries page and opening that specific entry for editing.

### How

1. **Add `journal_entry_id` to ledger row data** — the `ledgerRows` memo already has access to `line.journal_entry_id` but doesn't include it in the returned object. Add `journalEntryId` to the mapped row.

2. **Use `useNavigate`** from react-router-dom. When the Entry # cell is clicked, navigate to `/dashboard/journal?edit={journalEntryId}`.

3. **In `JournalEntries.tsx`**, read the `edit` query param on mount. If present, set `editEntryId` and open the `JournalEntryForm` dialog automatically.

### Changes

**`src/pages/dashboard/ChartOfAccounts.tsx`**:
- Import `useNavigate` from `react-router-dom`
- Add `journalEntryId: line.journal_entry_id` to the ledger row object (~line 195)
- Make the Entry # `TableCell` (~line 600) a clickable link styled element: `onClick` calls `navigate(\`/dashboard/journal?edit=${row.journalEntryId}\`)`, with `e.stopPropagation()` and hover styling (underline, cursor-pointer, accent color)

**`src/pages/dashboard/JournalEntries.tsx`**:
- Import `useSearchParams` from `react-router-dom`
- On mount, read `searchParams.get("edit")`. If present, set `editEntryId` and `formOpen = true`, then clear the param from the URL

