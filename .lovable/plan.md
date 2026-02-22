

# Bank Accounts with CSV Upload and AI Journal Entry Creation

## Overview
Build a full Bank Accounts page replacing the current placeholder. It will support manual bank account CRUD, CSV transaction upload, AI-powered journal entry suggestions from CSV data, and manual approval/edit before posting each entry. All imported CSV records are persisted as bank transactions linked to their corresponding journal entries via reference codes.

## Features

### 1. Bank Account Management (CRUD)
- List all bank accounts with name, institution, account number (last 4), type, balance
- Add bank account dialog: name, institution, account number/IBAN, account type (checking/savings/credit), currency
- Edit and soft-delete bank accounts
- Search/filter

### 2. Account Transaction History
- When a bank account is selected, show all its transactions (manually entered and CSV-imported)
- Display date, description, amount, type (debit/credit), reference code, reconciled status, linked journal entry
- Every CSV-imported row is stored as a `bank_transaction` record under the selected bank account
- Each transaction has a reference code that matches the linked journal entry's `entry_number`
- Clicking a transaction row navigates to the linked journal entry for review

### 3. CSV Upload and Parsing
- File upload area for CSV files
- Parse CSV client-side (date, description, amount columns)
- Column mapping UI if CSV headers don't match expected fields
- Preview parsed transactions in a table before proceeding

### 4. AI-Powered Journal Entry Suggestions
- Send parsed CSV transactions to an edge function that calls Lovable AI
- AI reads the tenant's chart of accounts and maps each transaction to appropriate debit/credit accounts
- Returns suggested journal entry lines for each transaction
- AI also generates a reference code per transaction for traceability

### 5. Review and Approve Flow
- Display AI suggestions in a review table with editable fields
- Each row shows: date, description, reference, suggested debit account, suggested credit account, amount
- User can edit account mappings, amounts, descriptions, and reference per row
- Individual "Approve" button per entry:
  1. Creates a `journal_entry` with the reference code as `entry_number`
  2. Creates corresponding `journal_lines` (debit and credit)
  3. Creates a `bank_transaction` record linked to the journal entry via `journal_entry_id`, storing the same reference code
- "Approve All" button for bulk approval
- Status badges: pending, approved, skipped

### 6. Transaction-Entry Matching
- Every approved CSV row produces both a `bank_transaction` and a `journal_entry`
- The `bank_transaction.reference` field stores the reference code
- The `bank_transaction.journal_entry_id` links to the created journal entry
- The journal entry's `entry_number` matches the reference code
- This creates a full audit trail: users can trace any bank transaction to its journal entry and vice versa

## Technical Plan

### Database
No schema changes needed. The existing `bank_accounts` and `bank_transactions` tables already have:
- `bank_transactions.journal_entry_id` (links to journal entry)
- `bank_transactions.reference` (stores reference code)
- `bank_transactions.transaction_type` (debit/credit)
- Proper RLS policies for tenant isolation

### New Edge Function: `process-bank-csv`
- Receives: array of parsed transactions + tenant's chart of accounts
- Uses Lovable AI (`google/gemini-3-flash-preview`) to map each transaction to debit/credit accounts
- Generates a unique reference code per transaction (e.g., `CSV-YYYYMMDD-NNN`)
- Returns array of suggestions with account IDs, descriptions, reference codes, and confidence

Config update in `supabase/config.toml`:
```toml
[functions.process-bank-csv]
verify_jwt = false
```

### New Page: `src/pages/dashboard/BankAccounts.tsx`
Replaces the placeholder at `/dashboard/banks`. Organized with tabs:
- **Accounts** tab: bank account list with add/edit/delete
- **Transactions** tab: shows all bank transactions for a selected account, with reference codes and journal entry links
- **Import** tab: CSV upload, AI processing, review and approve workflow

### Approval Flow Detail

```text
On "Approve" for a single row:
1. Generate entry_number = reference code (e.g., CSV-20260222-001)
2. INSERT into journal_entries (entry_number, entry_date, description, status='posted', tenant_id)
3. INSERT into journal_lines (debit line + credit line with mapped accounts)
4. INSERT into bank_transactions (bank_account_id, journal_entry_id, reference=entry_number,
   transaction_date, description, amount, transaction_type, tenant_id)
5. Mark row as "approved" in the UI
```

### Files to Create/Modify

1. **Create** `supabase/functions/process-bank-csv/index.ts` -- Edge function for AI processing
2. **Create** `src/pages/dashboard/BankAccounts.tsx` -- Full bank accounts page with accounts, transactions, and import tabs
3. **Modify** `src/App.tsx` -- Update the `/dashboard/banks` route import to use new component
4. **Modify** `supabase/config.toml` -- Add function config

### CSV Parsing
- Client-side parsing using basic string splitting (no extra library needed)
- Auto-detect common column names: date, description, amount, debit, credit
- Handle both single-amount format (positive/negative) and separate debit/credit columns
- Show column mapping if auto-detection fails

