

## Fix: Persist Pending Journal Entries Across Tab/Account Switches

### Root Cause

The `suggestionsCache` (a `useRef`) only saves suggestions when `importAccountId` changes (line 185-202). Two scenarios cause data loss:

1. **Switching tabs** (Import → Accounts → Import): The state variables `suggestions` and `parsedTxs` persist (they're in the parent component), so this *should* work. However, if `importAccountId` gets reset or the component remounts (navigation away from BankAccounts page and back), all state including the ref cache is lost.

2. **Re-selecting the same account**: If the user clears `importAccountId` (selects empty) then re-selects the same account, the `setImportAccountId` wrapper saves on departure but the `else if (newId !== prevId)` branch clears state — which is correct. The cache restore on line 192-195 should kick in. But if the user never changed `importAccountId` and just navigated away from the page, the ref is destroyed.

The core issue: **`useRef` does not survive component unmount**. When the user navigates to another dashboard page and back, the entire BankAccounts component remounts, wiping the ref cache.

### Solution

Sync the suggestions cache to `sessionStorage` so it survives component remounts. This is lightweight and scoped to the browser session.

### Changes to `src/pages/dashboard/BankAccounts.tsx`

1. **Initialize `suggestionsCache` from `sessionStorage`** on mount — read any previously stored cache.

2. **Write to `sessionStorage` whenever suggestions change** — keep the cache in sync using a `useEffect` that writes `{ [importAccountId]: { suggestions, parsedTxs } }` to sessionStorage.

3. **On `importAccountId` change** — keep the existing `setImportAccountId` wrapper logic, but also read from sessionStorage as a fallback when the ref cache is empty.

4. **Also persist `csvHeaders`, `csvRows`, and `colMap`** per account so the full import context is restored (not just the suggestions).

5. **Clear the sessionStorage entry for an account** when all its suggestions are approved/skipped (cleanup).

This ensures that even if the user navigates away from Bank Accounts entirely and comes back, their pending review entries are still there when they re-select the same bank account.

