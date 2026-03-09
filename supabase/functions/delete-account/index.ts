import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's auth token
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;

    // Create admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Find all tenants where user is owner
    const { data: userTenants, error: tenantError } = await supabaseAdmin
      .from('user_tenant_roles')
      .select('tenant_id')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .is('deleted_at', null);

    if (tenantError) {
      console.error('Error fetching tenants:', tenantError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch tenant data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantIds = userTenants?.map(t => t.tenant_id) || [];

    // Delete data for each tenant in correct order
    for (const tenantId of tenantIds) {
      console.log(`Deleting data for tenant: ${tenantId}`);

      // 1. Delete journal_lines
      await supabaseAdmin.from('journal_lines').delete().eq('tenant_id', tenantId);

      // 2. Delete journal_entries
      await supabaseAdmin.from('journal_entries').delete().eq('tenant_id', tenantId);

      // 3. Delete invoice_lines
      await supabaseAdmin.from('invoice_lines').delete().eq('tenant_id', tenantId);

      // 4. Delete invoices
      await supabaseAdmin.from('invoices').delete().eq('tenant_id', tenantId);

      // 5. Delete bank_transactions
      await supabaseAdmin.from('bank_transactions').delete().eq('tenant_id', tenantId);

      // 6. Delete bank_accounts
      await supabaseAdmin.from('bank_accounts').delete().eq('tenant_id', tenantId);

      // 7. Delete bills
      await supabaseAdmin.from('bills').delete().eq('tenant_id', tenantId);

      // 8. Delete vendors and customers
      await supabaseAdmin.from('vendors').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('customers').delete().eq('tenant_id', tenantId);

      // 9. Delete documents and forecasts
      await supabaseAdmin.from('documents').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('forecast_entries').delete().eq('tenant_id', tenantId);

      // 10. Delete audit logs and usage metrics
      await supabaseAdmin.from('audit_logs').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('usage_metrics').delete().eq('tenant_id', tenantId);

      // 11. Delete subscriptions and permissions
      await supabaseAdmin.from('subscriptions').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('tenant_permissions').delete().eq('tenant_id', tenantId);

      // 12. Delete user_tenant_roles
      await supabaseAdmin.from('user_tenant_roles').delete().eq('tenant_id', tenantId);

      // 13. Delete chart of accounts
      await supabaseAdmin.from('chart_of_accounts').delete().eq('tenant_id', tenantId);

      // Delete storage files for this tenant
      try {
        const { data: files } = await supabaseAdmin
          .storage
          .from('tenant-documents')
          .list(`${tenantId}`);

        if (files && files.length > 0) {
          const filePaths = files.map(f => `${tenantId}/${f.name}`);
          await supabaseAdmin.storage.from('tenant-documents').remove(filePaths);
        }
      } catch (storageError) {
        console.error('Error deleting storage files:', storageError);
      }

      // 14. Delete tenant
      await supabaseAdmin.from('tenants').delete().eq('id', tenantId);
    }

    // 15. Delete profile
    await supabaseAdmin.from('profiles').delete().eq('id', userId);

    // 16. Delete auth user
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      console.error('Error deleting auth user:', deleteUserError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Account and all associated data deleted successfully' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in delete-account function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
