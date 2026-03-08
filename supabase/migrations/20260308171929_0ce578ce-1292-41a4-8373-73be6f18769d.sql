
-- Create tenant_permissions table
CREATE TABLE public.tenant_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  permission_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, role, permission_key)
);

-- Enable RLS
ALTER TABLE public.tenant_permissions ENABLE ROW LEVEL SECURITY;

-- RLS: members can view
CREATE POLICY "Members can view permissions"
  ON public.tenant_permissions FOR SELECT
  USING (is_tenant_member(tenant_id));

-- RLS: owners can insert
CREATE POLICY "Owners can insert permissions"
  ON public.tenant_permissions FOR INSERT
  WITH CHECK (is_tenant_owner(tenant_id));

-- RLS: owners can update
CREATE POLICY "Owners can update permissions"
  ON public.tenant_permissions FOR UPDATE
  USING (is_tenant_owner(tenant_id));

-- RLS: owners can delete
CREATE POLICY "Owners can delete permissions"
  ON public.tenant_permissions FOR DELETE
  USING (is_tenant_owner(tenant_id));

-- Updated_at trigger
CREATE TRIGGER update_tenant_permissions_updated_at
  BEFORE UPDATE ON public.tenant_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to seed default permissions for a tenant
CREATE OR REPLACE FUNCTION public.seed_tenant_permissions(_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _roles public.app_role[] := ARRAY['owner', 'admin', 'accountant', 'viewer']::public.app_role[];
  _r public.app_role;
  _perm record;
BEGIN
  -- Define all permission keys and defaults per role
  -- Format: (permission_key, owner, admin, accountant, viewer)
  FOR _perm IN
    SELECT * FROM (VALUES
      ('dashboard.view',              true, true, true, true),
      ('accounts.view',               true, true, true, true),
      ('accounts.edit',               true, true, true, false),
      ('accounts.delete',             true, false, false, false),
      ('journal_entries.view',         true, true, true, true),
      ('journal_entries.edit',         true, true, true, false),
      ('journal_entries.delete',       true, false, false, false),
      ('invoices.view',               true, true, true, true),
      ('invoices.edit',               true, true, true, false),
      ('invoices.delete',             true, false, false, false),
      ('banking.view',                true, true, true, true),
      ('banking.edit',                true, true, true, false),
      ('banking.delete',              true, false, false, false),
      ('contacts.view',               true, true, true, true),
      ('contacts.edit',               true, true, true, false),
      ('contacts.delete',             true, false, false, false),
      ('documents.view',              true, true, true, true),
      ('documents.edit',              true, true, true, false),
      ('documents.delete',            true, false, false, false),
      ('reports.view',                true, true, true, true),
      ('team.view',                   true, true, true, true),
      ('team.manage',                 true, false, false, false),
      ('settings.view',               true, true, true, true),
      ('settings.edit',               true, false, false, false),
      ('settings.close_fiscal_year',  true, false, false, false),
      ('settings.manage_subscription',true, false, false, false)
    ) AS t(pkey, o, a, ac, v)
  LOOP
    INSERT INTO public.tenant_permissions (tenant_id, role, permission_key, allowed)
    VALUES
      (_tenant_id, 'owner', _perm.pkey, _perm.o),
      (_tenant_id, 'admin', _perm.pkey, _perm.a),
      (_tenant_id, 'accountant', _perm.pkey, _perm.ac),
      (_tenant_id, 'viewer', _perm.pkey, _perm.v)
    ON CONFLICT (tenant_id, role, permission_key) DO NOTHING;
  END LOOP;
END;
$$;

-- Security definer function for checking permissions (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_permission(_tenant_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tp.allowed
     FROM public.tenant_permissions tp
     JOIN public.user_tenant_roles utr ON utr.tenant_id = tp.tenant_id AND utr.role = tp.role
     WHERE tp.tenant_id = _tenant_id
       AND tp.permission_key = _permission_key
       AND utr.user_id = auth.uid()
       AND utr.deleted_at IS NULL
     LIMIT 1),
    false
  )
$$;
