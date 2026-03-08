-- Allow editors (not just owners) to delete journal lines
CREATE POLICY "Editors can delete journal lines"
ON public.journal_lines
FOR DELETE
TO authenticated
USING (can_edit_tenant_data(tenant_id));