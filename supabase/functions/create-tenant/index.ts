import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { companyName, userId } = await req.json();

    if (!companyName || !userId) {
      return new Response(
        JSON.stringify({ error: "companyName and userId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create tenant
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .insert({ name: companyName })
      .select("id")
      .single();

    if (tenantError) throw tenantError;

    // Assign user as owner
    const { error: roleError } = await supabaseAdmin
      .from("user_tenant_roles")
      .insert({
        user_id: userId,
        tenant_id: tenant.id,
        role: "owner",
      });

    if (roleError) throw roleError;

    // Create free trial subscription
    const { data: freePlan } = await supabaseAdmin
      .from("plans")
      .select("id")
      .eq("name", "Free Trial")
      .single();

    if (freePlan) {
      await supabaseAdmin.from("subscriptions").insert({
        tenant_id: tenant.id,
        plan_id: freePlan.id,
        status: "trialing",
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Seed default chart of accounts
    const defaultAccounts = [
      { code: "1000", name: "Cash", account_type: "asset" },
      { code: "1100", name: "Accounts Receivable", account_type: "asset" },
      { code: "1500", name: "Equipment", account_type: "asset" },
      { code: "2000", name: "Accounts Payable", account_type: "liability" },
      { code: "2100", name: "Credit Card Payable", account_type: "liability" },
      { code: "3000", name: "Owner's Equity", account_type: "equity" },
      { code: "3100", name: "Retained Earnings", account_type: "equity" },
      { code: "4000", name: "Revenue", account_type: "revenue" },
      { code: "4100", name: "Consulting Revenue", account_type: "revenue" },
      { code: "5000", name: "Cost of Goods Sold", account_type: "expense" },
      { code: "6000", name: "Rent Expense", account_type: "expense" },
      { code: "6100", name: "Utilities Expense", account_type: "expense" },
      { code: "6200", name: "Payroll Expense", account_type: "expense" },
      { code: "6300", name: "Office Supplies", account_type: "expense" },
      { code: "6400", name: "Software Subscriptions", account_type: "expense" },
    ];

    await supabaseAdmin.from("chart_of_accounts").insert(
      defaultAccounts.map((a) => ({
        ...a,
        tenant_id: tenant.id,
        created_by: userId,
      }))
    );

    return new Response(
      JSON.stringify({ tenantId: tenant.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating tenant:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
