-- Allow tenant members to upload files to their tenant folder
CREATE POLICY "Tenant members can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-documents'
  AND public.is_tenant_member((storage.foldername(name))[1]::uuid)
);

-- Allow tenant members to update/overwrite their files
CREATE POLICY "Tenant members can update files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tenant-documents'
  AND public.is_tenant_member((storage.foldername(name))[1]::uuid)
);

-- Allow tenant members to read their files
CREATE POLICY "Tenant members can read files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tenant-documents'
  AND public.is_tenant_member((storage.foldername(name))[1]::uuid)
);

-- Allow tenant owners to delete files
CREATE POLICY "Tenant owners can delete files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tenant-documents'
  AND public.is_tenant_owner((storage.foldername(name))[1]::uuid)
);