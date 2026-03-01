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
      // Assets (1000-1999)
      { code: "1010", name: "Cash and Cash Equivalents", account_type: "asset", description: "Checking, savings, and petty cash." },
      { code: "1100", name: "Accounts Receivable (AR)", account_type: "asset", description: "Money owed by customers for credit sales." },
      { code: "1150", name: "Allowance for Doubtful Accounts", account_type: "asset", description: "Contra-asset; estimated uncollectible AR." },
      { code: "1200", name: "Inventory", account_type: "asset", description: "Goods held for sale." },
      { code: "1300", name: "Prepaid Expenses", account_type: "asset", description: "Paid insurance, rent, or taxes not yet used." },
      { code: "1500", name: "Fixed Assets (PP&E)", account_type: "asset", description: "Land, buildings, and machinery." },
      { code: "1550", name: "Accumulated Depreciation", account_type: "asset", description: "Contra-asset; total depreciation taken to date." },
      // Liabilities (2000-2999)
      { code: "2010", name: "Accounts Payable (AP)", account_type: "liability", description: "Money owed to vendors/suppliers." },
      { code: "2100", name: "Accrued Liabilities", account_type: "liability", description: "Expenses incurred but not yet invoiced (e.g., wages)." },
      { code: "2200", name: "Deferred Revenue", account_type: "liability", description: "Money received for services not yet performed." },
      { code: "2300", name: "Notes Payable", account_type: "liability", description: "Formal loan agreements and bank debt." },
      { code: "2500", name: "Sales Tax Payable", account_type: "liability", description: "Taxes collected from customers to be remitted." },
      // Equity (3000-3999)
      { code: "3010", name: "Common Stock", account_type: "equity", description: "Initial investment by shareholders at par value." },
      { code: "3100", name: "Additional Paid-in Capital", account_type: "equity", description: "Investment in excess of par value." },
      { code: "3200", name: "Retained Earnings", account_type: "equity", description: "Cumulative net income minus dividends paid." },
      { code: "3300", name: "Owner's Draw / Dividends", account_type: "equity", description: "Distributions made to owners or shareholders." },
      // Revenue (4000-4999)
      { code: "4010", name: "Sales Revenue", account_type: "revenue", description: "Gross sales of products." },
      { code: "4020", name: "Service Revenue", account_type: "revenue", description: "Income from professional services." },
      { code: "4500", name: "Sales Returns and Allowances", account_type: "revenue", description: "Contra-revenue; credits given to customers for returns." },
      // COGS (5000-5999)
      { code: "5010", name: "Purchases", account_type: "expense", description: "Raw materials or goods for resale." },
      { code: "5050", name: "Freight-In", account_type: "expense", description: "Shipping costs to receive inventory." },
      { code: "5100", name: "Direct Labor", account_type: "expense", description: "Wages for employees directly making the product." },
      // Operating Expenses (6000-7999)
      { code: "6010", name: "Payroll Expense", account_type: "expense", description: "Salaries and wages." },
      { code: "6100", name: "Rent/Lease Expense", account_type: "expense", description: "Facilities costs." },
      { code: "6200", name: "Utilities Expense", account_type: "expense", description: "Electricity, water, heat." },
      { code: "6300", name: "Marketing & Advertising", account_type: "expense", description: "Promotion and social media costs." },
      { code: "6400", name: "Office Supplies", account_type: "expense", description: "Consumable items for daily operations." },
      { code: "6500", name: "Depreciation Expense", account_type: "expense", description: "Periodic allocation of fixed asset costs." },
      // Other Income & Expenses (8000-9999)
      { code: "8010", name: "Interest Income", account_type: "revenue", description: "Earnings from bank balances." },
      { code: "9010", name: "Interest Expense", account_type: "expense", description: "Costs of borrowing money." },
      { code: "9050", name: "Gain/Loss on Sale of Assets", account_type: "expense", description: "Difference between book value and sale price." },
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
