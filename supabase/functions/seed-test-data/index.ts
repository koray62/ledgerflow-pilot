import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenantId } = await req.json();
    if (!tenantId) throw new Error("tenantId is required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate caller is tenant owner
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: claimsErr } = await supabaseUser.auth.getUser();
    if (claimsErr || !claimsData.user) throw new Error("Unauthorized");
    const userId = claimsData.user.id;

    const { data: roleCheck } = await supabaseAdmin
      .from("user_tenant_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("role", "owner")
      .is("deleted_at", null)
      .maybeSingle();

    if (!roleCheck) throw new Error("Only tenant owners can seed data");

    // ── STEP 1: Clear existing data (FK order) ──
    await supabaseAdmin.from("journal_lines").delete().eq("tenant_id", tenantId);
    await supabaseAdmin.from("bank_transactions").delete().eq("tenant_id", tenantId);
    await supabaseAdmin.from("journal_entries").delete().eq("tenant_id", tenantId);
    await supabaseAdmin.from("documents").delete().eq("tenant_id", tenantId);

    // ── STEP 2: Fetch chart of accounts ──
    const { data: accounts } = await supabaseAdmin
      .from("chart_of_accounts")
      .select("id, code, name, account_type")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    if (!accounts || accounts.length === 0) throw new Error("No chart of accounts found");

    const find = (code: string) => accounts.find((a) => a.code === code);

    // Map standard accounts
    const cash = find("1010") || accounts.find((a) => a.account_type === "asset" && a.code >= "1010");
    const ar = find("1200") || accounts.find((a) => a.account_type === "asset" && a.code >= "1200");
    const revenue = find("4010") || accounts.find((a) => a.account_type === "revenue");
    const serviceRevenue = find("4020") || revenue;
    const payroll = find("6030") || accounts.find((a) => a.account_type === "expense");
    const rent = find("6010") || payroll;
    const utilities = find("6020") || payroll;
    const officeSupplies = find("6040") || payroll;
    const software = find("6050") || payroll;
    const ap = find("2010") || accounts.find((a) => a.account_type === "liability");
    const taxPayable = find("2020") || ap;

    if (!cash || !revenue || !payroll) throw new Error("Required accounts not found (1010, 4010, 6030)");

    // ── Fetch a bank account ──
    const { data: bankAccounts } = await supabaseAdmin
      .from("bank_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .limit(1);

    const bankAccountId = bankAccounts?.[0]?.id ?? null;

    // ── STEP 3: Seed data ──
    let entryCounter = 0;
    const allEntries: any[] = [];
    const allLines: any[] = [];
    const allBankTx: any[] = [];

    const years = [2022, 2023, 2024, 2025];

    for (const year of years) {
      for (let month = 1; month <= 12; month++) {
        // Skip future months
        if (year === 2026 || (year === 2025 && month > 12)) continue;

        const dateStr = `${year}-${String(month).padStart(2, "0")}`;
        const entryDate = `${dateStr}-15`;
        const status = year < 2025 ? "posted" : (month <= 9 ? "posted" : "draft");
        const postedAt = status === "posted" ? `${dateStr}-16T00:00:00Z` : null;

        // 1) Revenue - Product Sales
        entryCounter++;
        const revAmount = 5000 + Math.round(Math.random() * 15000);
        const revId = crypto.randomUUID();
        allEntries.push({
          id: revId, tenant_id: tenantId, entry_number: `JE-${year}-${String(entryCounter).padStart(3, "0")}`,
          entry_date: entryDate, description: `Product sales - ${dateStr}`,
          status, posted_at: postedAt, created_by: userId,
        });
        allLines.push(
          { tenant_id: tenantId, journal_entry_id: revId, account_id: ar!.id, debit: revAmount, credit: 0, description: "Accounts receivable" },
          { tenant_id: tenantId, journal_entry_id: revId, account_id: revenue!.id, debit: 0, credit: revAmount, description: "Product sales revenue" }
        );
        if (bankAccountId) {
          allBankTx.push({
            tenant_id: tenantId, bank_account_id: bankAccountId, journal_entry_id: revId,
            transaction_date: entryDate, amount: revAmount, transaction_type: "credit" as const,
            description: `Product sales ${dateStr}`, is_reconciled: status === "posted",
          });
        }

        // 2) Service Revenue
        entryCounter++;
        const svcAmount = 2000 + Math.round(Math.random() * 8000);
        const svcId = crypto.randomUUID();
        allEntries.push({
          id: svcId, tenant_id: tenantId, entry_number: `JE-${year}-${String(entryCounter).padStart(3, "0")}`,
          entry_date: `${dateStr}-05`, description: `Service revenue - ${dateStr}`,
          status, posted_at: postedAt, created_by: userId,
        });
        allLines.push(
          { tenant_id: tenantId, journal_entry_id: svcId, account_id: cash!.id, debit: svcAmount, credit: 0, description: "Cash received" },
          { tenant_id: tenantId, journal_entry_id: svcId, account_id: serviceRevenue!.id, debit: 0, credit: svcAmount, description: "Service revenue" }
        );
        if (bankAccountId) {
          allBankTx.push({
            tenant_id: tenantId, bank_account_id: bankAccountId, journal_entry_id: svcId,
            transaction_date: `${dateStr}-05`, amount: svcAmount, transaction_type: "credit" as const,
            description: `Service revenue ${dateStr}`, is_reconciled: status === "posted",
          });
        }

        // 3) Payroll
        entryCounter++;
        const payrollAmt = 8000 + Math.round(Math.random() * 4000);
        const payId = crypto.randomUUID();
        allEntries.push({
          id: payId, tenant_id: tenantId, entry_number: `JE-${year}-${String(entryCounter).padStart(3, "0")}`,
          entry_date: `${dateStr}-25`, description: `Payroll - ${dateStr}`,
          status, posted_at: postedAt, created_by: userId,
        });
        allLines.push(
          { tenant_id: tenantId, journal_entry_id: payId, account_id: payroll!.id, debit: payrollAmt, credit: 0, description: "Payroll expense" },
          { tenant_id: tenantId, journal_entry_id: payId, account_id: cash!.id, debit: 0, credit: payrollAmt, description: "Cash paid" }
        );
        if (bankAccountId) {
          allBankTx.push({
            tenant_id: tenantId, bank_account_id: bankAccountId, journal_entry_id: payId,
            transaction_date: `${dateStr}-25`, amount: payrollAmt, transaction_type: "debit" as const,
            description: `Payroll ${dateStr}`, is_reconciled: status === "posted",
          });
        }

        // 4) Rent
        entryCounter++;
        const rentAmt = 3000 + Math.round(Math.random() * 1000);
        const rentEntryId = crypto.randomUUID();
        allEntries.push({
          id: rentEntryId, tenant_id: tenantId, entry_number: `JE-${year}-${String(entryCounter).padStart(3, "0")}`,
          entry_date: `${dateStr}-01`, description: `Office rent - ${dateStr}`,
          status, posted_at: postedAt, created_by: userId,
        });
        allLines.push(
          { tenant_id: tenantId, journal_entry_id: rentEntryId, account_id: rent!.id, debit: rentAmt, credit: 0, description: "Rent expense" },
          { tenant_id: tenantId, journal_entry_id: rentEntryId, account_id: cash!.id, debit: 0, credit: rentAmt, description: "Cash paid" }
        );
        if (bankAccountId) {
          allBankTx.push({
            tenant_id: tenantId, bank_account_id: bankAccountId, journal_entry_id: rentEntryId,
            transaction_date: `${dateStr}-01`, amount: rentAmt, transaction_type: "debit" as const,
            description: `Rent payment ${dateStr}`, is_reconciled: status === "posted",
          });
        }

        // 5) Utilities
        entryCounter++;
        const utilAmt = 200 + Math.round(Math.random() * 300);
        const utilId = crypto.randomUUID();
        allEntries.push({
          id: utilId, tenant_id: tenantId, entry_number: `JE-${year}-${String(entryCounter).padStart(3, "0")}`,
          entry_date: `${dateStr}-10`, description: `Utilities - ${dateStr}`,
          status, posted_at: postedAt, created_by: userId,
        });
        allLines.push(
          { tenant_id: tenantId, journal_entry_id: utilId, account_id: utilities!.id, debit: utilAmt, credit: 0, description: "Utilities expense" },
          { tenant_id: tenantId, journal_entry_id: utilId, account_id: cash!.id, debit: 0, credit: utilAmt, description: "Cash paid" }
        );

        // 6) Office Supplies (every other month)
        if (month % 2 === 0) {
          entryCounter++;
          const suppAmt = 100 + Math.round(Math.random() * 400);
          const suppId = crypto.randomUUID();
          allEntries.push({
            id: suppId, tenant_id: tenantId, entry_number: `JE-${year}-${String(entryCounter).padStart(3, "0")}`,
            entry_date: `${dateStr}-12`, description: `Office supplies - ${dateStr}`,
            status, posted_at: postedAt, created_by: userId,
          });
          allLines.push(
            { tenant_id: tenantId, journal_entry_id: suppId, account_id: officeSupplies!.id, debit: suppAmt, credit: 0, description: "Office supplies" },
            { tenant_id: tenantId, journal_entry_id: suppId, account_id: ap!.id, debit: 0, credit: suppAmt, description: "Accounts payable" }
          );
        }

        // 7) Software subscription
        entryCounter++;
        const swAmt = 50 + Math.round(Math.random() * 150);
        const swId = crypto.randomUUID();
        allEntries.push({
          id: swId, tenant_id: tenantId, entry_number: `JE-${year}-${String(entryCounter).padStart(3, "0")}`,
          entry_date: `${dateStr}-20`, description: `Software subscription - ${dateStr}`,
          status, posted_at: postedAt, created_by: userId,
        });
        allLines.push(
          { tenant_id: tenantId, journal_entry_id: swId, account_id: software!.id, debit: swAmt, credit: 0, description: "Software expense" },
          { tenant_id: tenantId, journal_entry_id: swId, account_id: cash!.id, debit: 0, credit: swAmt, description: "Cash paid" }
        );

        // 8) Quarterly tax payment
        if (month % 3 === 0) {
          entryCounter++;
          const taxAmt = 1500 + Math.round(Math.random() * 2000);
          const taxId = crypto.randomUUID();
          allEntries.push({
            id: taxId, tenant_id: tenantId, entry_number: `JE-${year}-${String(entryCounter).padStart(3, "0")}`,
            entry_date: `${dateStr}-28`, description: `Quarterly tax payment - Q${month / 3} ${year}`,
            status, posted_at: postedAt, created_by: userId,
          });
          allLines.push(
            { tenant_id: tenantId, journal_entry_id: taxId, account_id: taxPayable!.id, debit: taxAmt, credit: 0, description: "Tax payment" },
            { tenant_id: tenantId, journal_entry_id: taxId, account_id: cash!.id, debit: 0, credit: taxAmt, description: "Cash paid" }
          );
          if (bankAccountId) {
            allBankTx.push({
              tenant_id: tenantId, bank_account_id: bankAccountId, journal_entry_id: taxId,
              transaction_date: `${dateStr}-28`, amount: taxAmt, transaction_type: "debit" as const,
              description: `Tax payment Q${month / 3} ${year}`, is_reconciled: status === "posted",
            });
          }
        }
      }
    }

    // Batch insert in chunks
    const chunkSize = 200;
    for (let i = 0; i < allEntries.length; i += chunkSize) {
      const { error } = await supabaseAdmin.from("journal_entries").insert(allEntries.slice(i, i + chunkSize));
      if (error) throw new Error(`Failed inserting entries: ${error.message}`);
    }
    for (let i = 0; i < allLines.length; i += chunkSize) {
      const { error } = await supabaseAdmin.from("journal_lines").insert(allLines.slice(i, i + chunkSize));
      if (error) throw new Error(`Failed inserting lines: ${error.message}`);
    }
    if (allBankTx.length > 0) {
      for (let i = 0; i < allBankTx.length; i += chunkSize) {
        const { error } = await supabaseAdmin.from("bank_transactions").insert(allBankTx.slice(i, i + chunkSize));
        if (error) throw new Error(`Failed inserting bank tx: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        entries: allEntries.length,
        lines: allLines.length,
        bankTransactions: allBankTx.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
