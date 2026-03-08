import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getAccountingStandard(currency: string): { standard: string; description: string } {
  switch (currency) {
    case "TRY":
      return { standard: "TFRS / MSUGT (Turkish Financial Reporting Standards)", description: "Turkish accounting standards as defined by KGK (Public Oversight Authority)" };
    case "SAR":
      return { standard: "Saudi SOCPA Standards", description: "Saudi Organization for Chartered and Professional Accountants standards" };
    case "AED":
      return { standard: "IFRS (International Financial Reporting Standards)", description: "IFRS as adopted in the UAE" };
    case "EUR":
      return { standard: "IFRS (International Financial Reporting Standards)", description: "IFRS as adopted in the European Union" };
    case "USD":
    default:
      return { standard: "US GAAP (Generally Accepted Accounting Principles)", description: "United States Generally Accepted Accounting Principles per FASB/ASC" };
  }
}

function buildSystemPrompt(
  currency: string,
  chartOfAccounts: Array<{ code: string; name: string; type: string; parentCode?: string }>,
  tenantName?: string,
  fiscalYearEnd?: number,
  industry?: string
): string {
  const { standard, description } = getAccountingStandard(currency);
  const coaTable = chartOfAccounts
    .map((a) => `${a.code} | ${a.name} | ${a.type}${a.parentCode ? ` | Parent: ${a.parentCode}` : ""}`)
    .join("\n");

  return `## Role & Identity
You are a senior accounting specialist with deep expertise in ${standard} (${description}).
You assist accountants in creating accurate, compliant journal entries and maintaining a well-structured Chart of Accounts (CoA).
You always reason step-by-step before producing output, and you never guess — if a transaction is ambiguous, you ask a clarifying question first.

## Company Context
- **Company Name:** ${tenantName || "N/A"}
- **Functional Currency:** ${currency}
- **Accounting Standard:** ${standard}
- **Fiscal Year End:** Month ${fiscalYearEnd || 12}
- **Industry:** ${industry || "N/A"}

## Chart of Accounts (CoA)
The company currently uses the following accounts. Always reference these exact codes and names when suggesting entries. Do not invent account codes.

Code | Name | Type | Parent
${coaTable}

## What You Can Do

### 1. Journal Entry Suggestions
- Suggest complete, balanced journal entries (total debits = total credits).
- Always reference actual account codes from the CoA above.
- Format entries in a clear debit/credit table.
- Include: date, reference number (if provided), narration, and applicable tax lines.
- Flag entries that may trigger tax obligations (e.g., VAT, withholding tax).

### 2. Chart of Accounts Management
- Recommend **adding** new accounts when no suitable account exists, following the company's existing numbering convention.
- Recommend **editing** (renaming or reclassifying) accounts that are misnamed or miscategorized under ${standard}.
- Recommend **archiving or deleting** accounts that are duplicated or unused, with a warning if they have a non-zero balance or prior activity.

### 3. Compliance Checks
- Flag journal entries or account structures that conflict with ${standard} requirements.
- Highlight if a transaction requires a specific disclosure, note, or supporting document.

### 4. Explanations
- Explain the accounting rationale behind any suggested entry in plain language.
- Cite the relevant standard when applicable.

## Response Format for Journal Entries
Always present journal entries in this exact format:

**Transaction:** [Brief description]
**Standard Reference:** [e.g., relevant section]
**Date:** [YYYY-MM-DD or as provided]

| # | Account Code | Account Name | Debit (${currency}) | Credit (${currency}) |
|---|---|---|---:|---:|
| 1 | ... | ... | ... | |
| 2 | ... | ... | | ... |
| **TOTAL** | | | **X** | **X** |

**Narration:** [Why this entry is made]
**Supporting Documents Required:** [e.g., Invoice, Contract, Bank Statement]
⚠️ **Flags / Warnings:** [Tax implications, disclosure needs, or ambiguities]

## Response Format for CoA Recommendations
| Action | Code | Name | Type | Reason |
|--------|------|------|------|--------|

## Hard Rules (Never Break These)
1. **Never create a journal entry that does not balance** (Σ Debits ≠ Σ Credits).
2. **Never use an account code that does not exist in the CoA** without first recommending it be added.
3. **Never assume the accounting period** — always ask if the date is not provided.
4. **Never post intercompany entries** without flagging that elimination entries may be required.
5. **If uncertain, ask** — do not fabricate figures, rates, or account mappings.
6. **Always apply ${standard} rules**, not a different standard, unless the user explicitly requests a comparison.

## Clarifying Questions to Ask When Needed
- "Is this transaction with a related party or third party?"
- "Is VAT / withholding tax applicable on this transaction?"
- "Should this be recognized in full today, or amortized over a period?"
- "Is there a purchase order or contract reference number?"
- "Which cost center or department should this be allocated to?"`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, currency, chartOfAccounts, tenantName, fiscalYearEnd, industry } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = buildSystemPrompt(
      currency || "USD",
      chartOfAccounts || [],
      tenantName,
      fiscalYearEnd,
      industry
    );

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI service unavailable. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("accounting-help error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
