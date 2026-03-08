

## Add "Detailed Description" Column to CSV Import

### Summary
Add a new optional "Detailed Description" column mapping to the CSV import flow. When mapped, merge it with the main description and send the merged text to the AI edge function for better CoA matching. However, only store the original (short) description in journal entries and bank transactions.

### Changes

**1. `src/pages/dashboard/BankAccounts.tsx`**

- **colMap state** (line 175): Add `detailDescIdx: -1` to the column map object.
- **autoDetectColumns** (lines 141-149): Add detection for a "detailed description" column using pattern `/detail.*desc|full.*desc|remarks|additional/` (avoiding collision with the existing `descIdx` pattern). Return `detailDescIdx`.
- **ParsedTx interface** (lines 43-47): Add optional `detailedDescription?: string` field.
- **applyColumnMapping** (lines 379-391): When `colMap.detailDescIdx >= 0`, read that column value into `detailedDescription` on each parsed transaction.
- **generateSuggestions** (lines 395-413): Before sending to the edge function, map `parsedTxs` to create a modified transactions array where each transaction's `description` is the merged string (`description + " | " + detailedDescription` when detailedDescription exists). Send this merged version to the AI. Keep `parsedTxs` unchanged so the original description is preserved for display and storage.
- **approveEntry** (lines 417-498): Use `s.originalTx.description` (the short description) for the journal entry description and bank transaction description — this is already the case since `originalTx` stores the original `ParsedTx`.
- **Column mapping UI** (around lines 726-739): Add a new `<Select>` for "Detailed Description Column (Optional)" with an extra "None" option (`value="-1"`).
- **Cache type** (line 188): Already includes `colMap` so no change needed — the new field will serialize automatically.

**2. `supabase/functions/process-bank-csv/index.ts`**
No changes needed — the edge function already receives `description` from the transactions array. We just send a richer merged description.

### Flow
1. User uploads CSV → auto-detect maps "Detailed Description" if found
2. User can manually select/change the detailed description column (or leave as "None")
3. Apply Mapping → `parsedTxs` stores both `description` and `detailedDescription`
4. Generate Suggestions → AI receives merged description for better matching
5. Approve → journal entry and bank transaction use only the original short description

