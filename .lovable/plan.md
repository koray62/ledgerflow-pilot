

## Invoice Numbering Update

### Current Behavior
Format: `{YEAR}-INV-{00001}` (5-digit sequential, starting from 1)

### New Behavior
Format: `LP{YEAR}{NNNNNN}` where the sequential number starts from `000101`.

Example: `LP2026000101`, `LP2026000102`, ...

### Changes

**File: `src/pages/dashboard/Invoices.tsx`** (lines 268-278)

Update the `nextInvoiceNumber` function:
- Change prefix from `{year}-INV-` to `LP{year}`
- Extract trailing digits from existing invoices matching the `LP{year}` prefix
- If no existing invoices for the current year, start at `000101`
- Otherwise increment the max found number by 1
- Pad to 6 digits

