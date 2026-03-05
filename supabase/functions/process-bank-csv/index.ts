import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transactions, accounts, vendors = [], customers = [] } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!transactions?.length || !accounts?.length) {
      return new Response(
        JSON.stringify({ error: "transactions and accounts arrays are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    const vendorList = vendors.length
      ? `\n\nHere are the registered vendors (suppliers):\n${JSON.stringify(vendors.map((v: any) => ({ id: v.id, name: v.name })))}`
      : "";

    const customerList = customers.length
      ? `\n\nHere are the registered customers:\n${JSON.stringify(customers.map((c: any) => ({ id: c.id, name: c.name })))}`
      : "";

    const contactMatchingRules = (vendors.length || customers.length)
      ? `\n\nIMPORTANT - Contact matching rules:
- When a transaction description contains or closely matches a VENDOR name, classify it as an expense/payment to that vendor and use the appropriate expense account.
- When a transaction description contains or closely matches a CUSTOMER name, classify it as revenue/income from that customer (e.g., credit a Sales Revenue account like 4010).
- Partial name matches count (e.g., "Monai" matches vendor/customer "Monai Finansal").`
      : "";

    const systemPrompt = `You are an expert accountant. You will receive a list of bank transactions and a chart of accounts.

For each transaction, determine the most appropriate debit and credit accounts using double-entry accounting rules:
- Money coming IN (positive amounts, deposits, credits): Debit the bank/cash asset account, Credit the appropriate revenue/liability account
- Money going OUT (negative amounts, withdrawals, debits): Credit the bank/cash asset account, Debit the appropriate expense/asset account

Generate a unique reference code for each transaction in the format CSV-${today}-NNN where NNN is a zero-padded sequential number starting from 001.

Here is the chart of accounts:
${JSON.stringify(accounts.map((a: any) => ({ id: a.id, code: a.code, name: a.name, type: a.account_type })))}${vendorList}${customerList}${contactMatchingRules}

Here are the transactions to process:
${JSON.stringify(transactions.map((t: any, i: number) => ({ index: i, date: t.date, description: t.description, amount: t.amount })))}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content:
                "Map each transaction to appropriate debit and credit accounts. Return the results using the suggest_entries tool.",
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "suggest_entries",
                description:
                  "Return journal entry suggestions for each bank transaction",
                parameters: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          transactionIndex: {
                            type: "number",
                            description: "Index of the transaction in the input array",
                          },
                          reference: {
                            type: "string",
                            description: "Unique reference code e.g. CSV-20260222-001",
                          },
                          description: {
                            type: "string",
                            description: "Journal entry description",
                          },
                          debitAccountId: {
                            type: "string",
                            description: "UUID of the debit account from chart of accounts",
                          },
                          creditAccountId: {
                            type: "string",
                            description: "UUID of the credit account from chart of accounts",
                          },
                          amount: {
                            type: "number",
                            description: "Absolute amount for the journal entry",
                          },
                        },
                        required: [
                          "transactionIndex",
                          "reference",
                          "description",
                          "debitAccountId",
                          "creditAccountId",
                          "amount",
                        ],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["suggestions"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "suggest_entries" },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "AI processing failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "AI did not return structured suggestions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-bank-csv error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
