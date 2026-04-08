
-- Drop and recreate the UPDATE policy with explicit WITH CHECK
DROP POLICY IF EXISTS "Editors can update accounts" ON public.chart_of_accounts;

CREATE POLICY "Editors can update accounts"
ON public.chart_of_accounts
FOR UPDATE
USING (can_edit_tenant_data(tenant_id))
WITH CHECK (can_edit_tenant_data(tenant_id));
