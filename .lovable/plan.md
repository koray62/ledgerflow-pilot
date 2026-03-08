

## Problem

The two journal entry action buttons on the invoice list look nearly identical (both use `BookOpen` icon, differentiated only by a subtle green tint and hover tooltip). This makes it easy to confuse which button opens which entry. Additionally, for invoice LP2026000103, the `journal_entry_id` and `payment_journal_entry_id` values may have been stored in the wrong columns due to the earlier bug.

## Fix

1. **Differentiate the buttons visually** in `src/pages/dashboard/Invoices.tsx` (lines 705-723):
   - Use a `FileText` icon (or similar) for the **Accrual Journal Entry** button with a label/tooltip "Accrual Entry"
   - Use a `Banknote` or `CreditCard` icon for the **Payment Journal Entry** button with a label/tooltip "Payment Entry"
   - Add visible text labels next to the icons (e.g., small text like "Accrual" / "Payment") so users don't need to hover

2. **No data migration needed** — the user can manually fix LP2026000103 by editing the entry, or we can note that entries created before the fix may have swapped IDs.

### Code Change (lines ~705-723 in Invoices.tsx)

Replace the two `BookOpen` buttons with distinct icons:
- Accrual button: `FileText` icon (blue tint) + title "View Accrual Journal Entry"  
- Payment button: `Banknote` icon (green tint) + title "View Payment Journal Entry"

Import `FileText` and `Banknote` from `lucide-react`.

