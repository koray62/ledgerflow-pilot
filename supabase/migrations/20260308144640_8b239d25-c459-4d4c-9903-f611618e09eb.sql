
-- Create invoice_lines table
CREATE TABLE public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  account_id uuid REFERENCES public.chart_of_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoice_lines
CREATE POLICY "Members can view invoice lines" ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));

CREATE POLICY "Editors can insert invoice lines" ON public.invoice_lines
  FOR INSERT TO authenticated
  WITH CHECK (can_edit_tenant_data(tenant_id));

CREATE POLICY "Editors can update invoice lines" ON public.invoice_lines
  FOR UPDATE TO authenticated
  USING (can_edit_tenant_data(tenant_id));

CREATE POLICY "Owners can delete invoice lines" ON public.invoice_lines
  FOR DELETE TO authenticated
  USING (is_tenant_owner(tenant_id));

-- Add payment_journal_entry_id to invoices
ALTER TABLE public.invoices ADD COLUMN payment_journal_entry_id uuid REFERENCES public.journal_entries(id);
