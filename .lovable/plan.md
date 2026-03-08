

## Problem

There is a **query cache key mismatch** preventing the Journal Entries page from refreshing after invoice operations.

- **JournalEntries.tsx** uses query key: `["journal-entries", tenantId]` (hyphen)
- **Invoices.tsx** invalidates: `["journal_entries"]` (underscore)

These don't match, so after creating an invoice (accrual entry) or recording a payment, the Journal Entries list never refreshes. The entries exist in the database but the UI shows stale data until a full page reload.

## Fix

**Single file change: `src/pages/dashboard/Invoices.tsx`**

Update all three `qc.invalidateQueries` calls that reference `"journal_entries"` to use `"journal-entries"` instead, matching the key used in JournalEntries.tsx. There are 3 locations:

1. **Line ~427** (after `handleSave`): `queryKey: ["journal_entries"]` → `["journal-entries"]`
2. **Line ~496** (after `handleRecordPayment`): `queryKey: ["journal_entries"]` → `["journal-entries"]`
3. **Line ~528** (after `handleCancelInvoice`): `queryKey: ["journal_entries"]` → `["journal-entries"]`

Also update the `journal_lines` invalidation on line ~529 from `"journal_lines"` to `"journal-line-totals"` to match JournalEntries.tsx's key.

This ensures the Journal Entries table refreshes immediately after any invoice operation.

