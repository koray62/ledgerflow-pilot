-- Add chatbot.use permission to seed_tenant_permissions function
CREATE OR REPLACE FUNCTION public.seed_tenant_permissions(_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _roles public.app_role[] := ARRAY['owner', 'admin', 'accountant', 'viewer']::public.app_role[];
  _r public.app_role;
  _perm record;
BEGIN
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
      ('chatbot.use',                 true, true, true, false),
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
$function$;

-- Seed chatbot.use for all existing tenants
INSERT INTO public.tenant_permissions (tenant_id, role, permission_key, allowed)
SELECT t.id, r.role, 'chatbot.use', 
  CASE WHEN r.role IN ('owner', 'admin', 'accountant') THEN true ELSE false END
FROM public.tenants t
CROSS JOIN (VALUES ('owner'::app_role), ('admin'::app_role), ('accountant'::app_role), ('viewer'::app_role)) AS r(role)
ON CONFLICT (tenant_id, role, permission_key) DO NOTHING;