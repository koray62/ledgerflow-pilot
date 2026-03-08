
ALTER TABLE public.tenants ADD COLUMN default_currency text NOT NULL DEFAULT 'USD';
ALTER TABLE public.journal_entries ADD COLUMN currency text NOT NULL DEFAULT 'USD';
ALTER TABLE public.invoices ADD COLUMN currency text NOT NULL DEFAULT 'USD';
