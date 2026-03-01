
-- Allow tenant members to view profiles of users in the same tenant
CREATE POLICY "Tenant members can view co-member profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_tenant_roles utr1
    JOIN public.user_tenant_roles utr2 ON utr1.tenant_id = utr2.tenant_id
    WHERE utr1.user_id = auth.uid()
      AND utr2.user_id = profiles.id
      AND utr1.deleted_at IS NULL
      AND utr2.deleted_at IS NULL
  )
);
