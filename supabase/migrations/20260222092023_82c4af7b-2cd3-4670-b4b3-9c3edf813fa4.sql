
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'accountant', 'viewer');
CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE public.entry_status AS ENUM ('draft', 'pending', 'posted', 'voided');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');
CREATE TYPE public.bill_status AS ENUM ('draft', 'received', 'paid', 'overdue', 'cancelled');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled');
CREATE TYPE public.transaction_type AS ENUM ('debit', 'credit');
CREATE TYPE public.document_status AS ENUM ('uploaded', 'processing', 'completed', 'review_required', 'failed');

-- ============================================================
-- PLANS (public, no tenant)
-- ============================================================
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_annual NUMERIC(10,2),
  max_journal_entries INTEGER,
  max_ocr_scans INTEGER DEFAULT 5,
  max_users INTEGER DEFAULT 1,
  max_storage_mb INTEGER DEFAULT 100,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans readable by all" ON public.plans FOR SELECT USING (true);

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  fiscal_year_end INTEGER DEFAULT 12,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_tenants_deleted ON public.tenants(deleted_at) WHERE deleted_at IS NULL;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES (one per auth.user)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- USER TENANT ROLES (membership + role)
-- ============================================================
CREATE TABLE public.user_tenant_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX idx_utr_user ON public.user_tenant_roles(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_utr_tenant ON public.user_tenant_roles(tenant_id) WHERE deleted_at IS NULL;
ALTER TABLE public.user_tenant_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECURITY DEFINER HELPER FUNCTIONS
-- ============================================================

-- Check if current auth user is a member of a tenant
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_tenant_roles
    WHERE user_id = auth.uid()
      AND tenant_id = _tenant_id
      AND deleted_at IS NULL
  )
$$;

-- Check if current auth user has a specific role in a tenant
CREATE OR REPLACE FUNCTION public.has_tenant_role(_tenant_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_tenant_roles
    WHERE user_id = auth.uid()
      AND tenant_id = _tenant_id
      AND role = _role
      AND deleted_at IS NULL
  )
$$;

-- Check if current auth user can edit financial data (owner, admin, or accountant)
CREATE OR REPLACE FUNCTION public.can_edit_tenant_data(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_tenant_roles
    WHERE user_id = auth.uid()
      AND tenant_id = _tenant_id
      AND role IN ('owner', 'admin', 'accountant')
      AND deleted_at IS NULL
  )
$$;

-- Check if current auth user is owner of tenant
CREATE OR REPLACE FUNCTION public.is_tenant_owner(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_tenant_roles
    WHERE user_id = auth.uid()
      AND tenant_id = _tenant_id
      AND role = 'owner'
      AND deleted_at IS NULL
  )
$$;

-- ============================================================
-- RLS: TENANTS (using helper functions)
-- ============================================================
CREATE POLICY "Members can view their tenants" ON public.tenants
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(id));
CREATE POLICY "Owners can update tenant" ON public.tenants
  FOR UPDATE USING (public.is_tenant_owner(id));
CREATE POLICY "Authenticated can create tenant" ON public.tenants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- RLS: USER TENANT ROLES
-- ============================================================
CREATE POLICY "Members can view roles in their tenants" ON public.user_tenant_roles
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Owners can manage roles" ON public.user_tenant_roles
  FOR INSERT WITH CHECK (public.is_tenant_owner(tenant_id));
CREATE POLICY "Owners can update roles" ON public.user_tenant_roles
  FOR UPDATE USING (public.is_tenant_owner(tenant_id));
CREATE POLICY "Owners can delete roles" ON public.user_tenant_roles
  FOR DELETE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  status public.subscription_status NOT NULL DEFAULT 'trialing',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_sub_tenant ON public.subscriptions(tenant_id);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view subscription" ON public.subscriptions
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Owners can manage subscription" ON public.subscriptions
  FOR INSERT WITH CHECK (public.is_tenant_owner(tenant_id));
CREATE POLICY "Owners can update subscription" ON public.subscriptions
  FOR UPDATE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- CHART OF ACCOUNTS
-- ============================================================
CREATE TABLE public.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.chart_of_accounts(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type public.account_type NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, code)
);

CREATE INDEX idx_coa_tenant ON public.chart_of_accounts(tenant_id) WHERE deleted_at IS NULL;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view accounts" ON public.chart_of_accounts
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Editors can insert accounts" ON public.chart_of_accounts
  FOR INSERT WITH CHECK (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Editors can update accounts" ON public.chart_of_accounts
  FOR UPDATE USING (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Owners can delete accounts" ON public.chart_of_accounts
  FOR DELETE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- JOURNAL ENTRIES
-- ============================================================
CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entry_number TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  status public.entry_status NOT NULL DEFAULT 'draft',
  memo TEXT,
  created_by UUID REFERENCES public.profiles(id),
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, entry_number)
);

CREATE INDEX idx_je_tenant ON public.journal_entries(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_je_date ON public.journal_entries(tenant_id, entry_date);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view entries" ON public.journal_entries
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Editors can insert entries" ON public.journal_entries
  FOR INSERT WITH CHECK (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Editors can update entries" ON public.journal_entries
  FOR UPDATE USING (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Owners can delete entries" ON public.journal_entries
  FOR DELETE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- JOURNAL LINES
-- ============================================================
CREATE TABLE public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  debit NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit NUMERIC(15,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_jl_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX idx_jl_tenant ON public.journal_lines(tenant_id) WHERE deleted_at IS NULL;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view lines" ON public.journal_lines
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Editors can insert lines" ON public.journal_lines
  FOR INSERT WITH CHECK (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Editors can update lines" ON public.journal_lines
  FOR UPDATE USING (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Owners can delete lines" ON public.journal_lines
  FOR DELETE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- BANK ACCOUNTS
-- ============================================================
CREATE TABLE public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  institution TEXT,
  account_number_last4 TEXT,
  account_type TEXT DEFAULT 'checking',
  currency TEXT NOT NULL DEFAULT 'USD',
  current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_ba_tenant ON public.bank_accounts(tenant_id) WHERE deleted_at IS NULL;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view bank accounts" ON public.bank_accounts
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Editors can insert bank accounts" ON public.bank_accounts
  FOR INSERT WITH CHECK (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Editors can update bank accounts" ON public.bank_accounts
  FOR UPDATE USING (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Owners can delete bank accounts" ON public.bank_accounts
  FOR DELETE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- BANK TRANSACTIONS
-- ============================================================
CREATE TABLE public.bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  transaction_type public.transaction_type NOT NULL,
  is_reconciled BOOLEAN NOT NULL DEFAULT false,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_bt_tenant ON public.bank_transactions(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bt_bank ON public.bank_transactions(bank_account_id);
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view transactions" ON public.bank_transactions
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Editors can insert transactions" ON public.bank_transactions
  FOR INSERT WITH CHECK (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Editors can update transactions" ON public.bank_transactions
  FOR UPDATE USING (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Owners can delete transactions" ON public.bank_transactions
  FOR DELETE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- VENDORS
-- ============================================================
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  contact_person TEXT,
  tax_id TEXT,
  payment_terms INTEGER DEFAULT 30,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_vendors_tenant ON public.vendors(tenant_id) WHERE deleted_at IS NULL;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view vendors" ON public.vendors
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Editors can insert vendors" ON public.vendors
  FOR INSERT WITH CHECK (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Editors can update vendors" ON public.vendors
  FOR UPDATE USING (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Owners can delete vendors" ON public.vendors
  FOR DELETE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  contact_person TEXT,
  tax_id TEXT,
  payment_terms INTEGER DEFAULT 30,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_customers_tenant ON public.customers(tenant_id) WHERE deleted_at IS NULL;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view customers" ON public.customers
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Editors can insert customers" ON public.customers
  FOR INSERT WITH CHECK (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Editors can update customers" ON public.customers
  FOR UPDATE USING (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Owners can delete customers" ON public.customers
  FOR DELETE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- INVOICES (AR)
-- ============================================================
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id),
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, invoice_number)
);

CREATE INDEX idx_invoices_tenant ON public.invoices(tenant_id) WHERE deleted_at IS NULL;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view invoices" ON public.invoices
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Editors can insert invoices" ON public.invoices
  FOR INSERT WITH CHECK (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Editors can update invoices" ON public.invoices
  FOR UPDATE USING (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Owners can delete invoices" ON public.invoices
  FOR DELETE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- BILLS (AP)
-- ============================================================
CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES public.vendors(id),
  bill_number TEXT NOT NULL,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
  status public.bill_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, bill_number)
);

CREATE INDEX idx_bills_tenant ON public.bills(tenant_id) WHERE deleted_at IS NULL;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view bills" ON public.bills
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Editors can insert bills" ON public.bills
  FOR INSERT WITH CHECK (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Editors can update bills" ON public.bills
  FOR UPDATE USING (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Owners can delete bills" ON public.bills
  FOR DELETE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- FORECAST ENTRIES
-- ============================================================
CREATE TABLE public.forecast_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  forecast_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  category TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_interval TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_fe_tenant ON public.forecast_entries(tenant_id) WHERE deleted_at IS NULL;
ALTER TABLE public.forecast_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view forecasts" ON public.forecast_entries
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Editors can insert forecasts" ON public.forecast_entries
  FOR INSERT WITH CHECK (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Editors can update forecasts" ON public.forecast_entries
  FOR UPDATE USING (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Owners can delete forecasts" ON public.forecast_entries
  FOR DELETE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- DOCUMENTS (OCR uploads)
-- ============================================================
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  status public.document_status NOT NULL DEFAULT 'uploaded',
  ocr_confidence NUMERIC(5,2),
  extracted_data JSONB DEFAULT '{}',
  suggested_vendor TEXT,
  suggested_amount NUMERIC(15,2),
  suggested_account_id UUID REFERENCES public.chart_of_accounts(id),
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  processing_time_ms INTEGER,
  error_message TEXT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_docs_tenant ON public.documents(tenant_id) WHERE deleted_at IS NULL;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view documents" ON public.documents
  FOR SELECT USING (deleted_at IS NULL AND public.is_tenant_member(tenant_id));
CREATE POLICY "Editors can insert documents" ON public.documents
  FOR INSERT WITH CHECK (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Editors can update documents" ON public.documents
  FOR UPDATE USING (public.can_edit_tenant_data(tenant_id));
CREATE POLICY "Owners can delete documents" ON public.documents
  FOR DELETE USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- AUDIT LOGS (append-only)
-- ============================================================
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_tenant ON public.audit_logs(tenant_id);
CREATE INDEX idx_audit_created ON public.audit_logs(tenant_id, created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_tenant_member(tenant_id));

-- ============================================================
-- USAGE METRICS
-- ============================================================
CREATE TABLE public.usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_um_tenant ON public.usage_metrics(tenant_id);
ALTER TABLE public.usage_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view usage" ON public.usage_metrics
  FOR SELECT USING (public.is_tenant_owner(tenant_id));

-- ============================================================
-- TRIGGER: Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TRIGGER: updated_at auto-update
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_plans_ts BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_tenants_ts BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_profiles_ts BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_utr_ts BEFORE UPDATE ON public.user_tenant_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_subscriptions_ts BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_coa_ts BEFORE UPDATE ON public.chart_of_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_je_ts BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_jl_ts BEFORE UPDATE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_ba_ts BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_bt_ts BEFORE UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_vendors_ts BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_customers_ts BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_invoices_ts BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_bills_ts BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_fe_ts BEFORE UPDATE ON public.forecast_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_docs_ts BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_um_ts BEFORE UPDATE ON public.usage_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- SEED: Plans
-- ============================================================
INSERT INTO public.plans (name, description, price_monthly, price_annual, max_journal_entries, max_ocr_scans, max_users, max_storage_mb) VALUES
  ('Free Trial', '14-day free trial with limited features', 0, NULL, 50, 5, 1, 100),
  ('Starter', 'For small businesses getting started', 29, 290, 500, 50, 3, 1000),
  ('Pro', 'Unlimited transactions and advanced features', 79, 790, NULL, 500, 10, 10000),
  ('Enterprise', 'Custom limits, API access, white-label', 199, 1990, NULL, NULL, NULL, NULL);

-- ============================================================
-- STORAGE: Tenant documents bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('tenant-documents', 'tenant-documents', false);

CREATE POLICY "Tenant members can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tenant-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Tenant members can view documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-documents' AND auth.uid() IS NOT NULL);
