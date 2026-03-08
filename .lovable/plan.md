

## Plan: Invoice Management System

### What We're Building

A full invoicing page replacing the current placeholder at `/dashboard/invoices`, with:
1. **Invoice list** — searchable table of all invoices with status badges
2. **Invoice creation/edit form** — select customer, add line items, auto-calculate subtotal/tax/total
3. **Auto journal entry on creation** — DR Accounts Receivable, CR Sales Revenue, CR VAT Payable (20%)
4. **Payment recording** — creates a second journal entry (DR Bank, CR Accounts Receivable) and marks invoice as paid
5. **Invoice template/preview** — printable/PDF-ready invoice layout with company info, customer details, line items, totals

### Database Changes

**1. New table: `invoice_lines`**
```sql
CREATE TABLE public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  account_id uuid REFERENCES chart_of_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
-- RLS policies matching other tenant tables
```

**2. Add `payment_journal_entry_id` to invoices**
```sql
ALTER TABLE invoices ADD COLUMN payment_journal_entry_id uuid REFERENCES journal_entries(id);
```

This column stores the journal entry created when payment is received, keeping it separate from the original AR journal entry in `journal_entry_id`.

### Accounting Logic

**On invoice creation (status = "sent"):**
- Auto-create a journal entry with:
  - DR Accounts Receivable → `total_amount`
  - CR Sales Revenue → `subtotal`  
  - CR VAT Payable → `tax_amount` (20% of subtotal)
- Link via `invoices.journal_entry_id`

**On payment received:**
- Auto-create a second journal entry:
  - DR Bank Account → `total_amount`
  - CR Accounts Receivable → `total_amount`
- Link via `invoices.payment_journal_entry_id`
- Update `amount_paid = total_amount`, `status = 'paid'`

### Files to Create/Edit

1. **`src/pages/dashboard/Invoices.tsx`** (new) — Main page with:
   - Invoice list table with search, status filters
   - "New Invoice" button opening a dialog/form
   - Form: customer selector, line items (description, qty, unit price), notes, due date
   - Auto-calc subtotal, 20% tax, total
   - "Record Payment" action on sent/overdue invoices (select bank account)
   - Invoice preview/template dialog (printable layout)

2. **`src/App.tsx`** — Replace `PlaceholderPage` import with new `Invoices` component

3. **`src/components/dashboard/DashboardLayout.tsx`** — Add `Receipt` icon nav item for Invoices

4. **Database migration** — Create `invoice_lines` table, add `payment_journal_entry_id` column, RLS policies

### Invoice Template Design

The preview/template will be a styled card with:
- Company name/logo header
- Invoice number, date, due date
- Bill-to customer details (name, email, address)
- Line items table (description, qty, unit price, amount)
- Subtotal, VAT (20%), Total
- Payment status indicator
- Print/PDF export via existing jspdf + html2canvas

### Navigation

Add "Invoices" to the sidebar nav between "Vendors & Customers" and "Team".

