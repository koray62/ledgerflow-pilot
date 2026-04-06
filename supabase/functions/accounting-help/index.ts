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

interface JournalLine {
  account: string;
  debit: number;
  credit: number;
  description: string | null;
}

interface JournalEntry {
  entry_number: string;
  date: string;
  description: string;
  status: string;
  memo: string | null;
  lines: JournalLine[];
}

interface Invoice {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  currency: string;
  notes: string | null;
}

interface Bill {
  bill_number: string;
  bill_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  notes: string | null;
}

interface BankAccount {
  name: string;
  institution: string | null;
  currency: string;
  current_balance: number;
  account_type: string | null;
  is_active: boolean;
}

function buildFinancialDataSection(
  currency: string,
  journalEntries: JournalEntry[],
  invoices: Invoice[],
  bills: Bill[],
  bankAccounts: BankAccount[]
): string {
  let sections = "";

  if (journalEntries.length > 0) {
    const jeTable = journalEntries.map((je) => {
      const linesStr = je.lines
        .map((l) => `    ${l.account} | Dr ${l.debit} | Cr ${l.credit}${l.description ? ` | ${l.description}` : ""}`)
        .join("\n");
      return `  ${je.entry_number} | ${je.date} | ${je.description} | Status: ${je.status}${je.memo ? ` | Memo: ${je.memo}` : ""}\n${linesStr}`;
    }).join("\n\n");

    sections += `\n\n## Journal Entries (Recent ${journalEntries.length} records)
Use these records to answer questions about specific transactions, balances, and accounting history. The user may refer to entries by their entry number (e.g., JE-XXXX).

${jeTable}`;
  }

  if (invoices.length > 0) {
    const invTable = invoices.map((inv) =>
      `  ${inv.invoice_number} | ${inv.invoice_date} | Due: ${inv.due_date} | Total: ${inv.total_amount} ${inv.currency} | Paid: ${inv.amount_paid} | Status: ${inv.status}${inv.notes ? ` | ${inv.notes}` : ""}`
    ).join("\n");

    sections += `\n\n## Invoices (Recent ${invoices.length} records)
${invTable}`;
  }

  if (bills.length > 0) {
    const billTable = bills.map((b) =>
      `  ${b.bill_number} | ${b.bill_date} | Due: ${b.due_date} | Total: ${b.total_amount} ${currency} | Paid: ${b.amount_paid} | Status: ${b.status}${b.notes ? ` | ${b.notes}` : ""}`
    ).join("\n");

    sections += `\n\n## Bills (Recent ${bills.length} records)
${billTable}`;
  }

  if (bankAccounts.length > 0) {
    const bankTable = bankAccounts.map((ba) =>
      `  ${ba.name} | ${ba.institution || "N/A"} | ${ba.currency} | Balance: ${ba.current_balance} | Type: ${ba.account_type || "N/A"} | Active: ${ba.is_active}`
    ).join("\n");

    sections += `\n\n## Bank Accounts
${bankTable}`;
  }

  return sections;
}

function buildSystemPrompt(
  currency: string,
  chartOfAccounts: Array<{ code: string; name: string; type: string; parentCode?: string }>,
  tenantName?: string,
  fiscalYearEnd?: number,
  industry?: string,
  accountingBasis?: string,
  journalEntries: JournalEntry[] = [],
  invoices: Invoice[] = [],
  bills: Bill[] = [],
  bankAccounts: BankAccount[] = []
): string {
  const { standard, description } = getAccountingStandard(currency);
  const coaTable = chartOfAccounts
    .map((a) => `${a.code} | ${a.name} | ${a.type}${a.parentCode ? ` | Parent: ${a.parentCode}` : ""}`)
    .join("\n");

  const financialData = buildFinancialDataSection(currency, journalEntries, invoices, bills, bankAccounts);

  return `## Role & Identity
You are a senior accounting specialist with deep expertise in ${standard} (${description}).
You assist accountants in creating accurate, compliant journal entries and maintaining a well-structured Chart of Accounts (CoA).
You always reason step-by-step before producing output, and you never guess — if a transaction is ambiguous, you ask a clarifying question first.

## Company Context
- **Company Name:** ${tenantName || "N/A"}
- **Functional Currency:** ${currency}
- **Accounting Standard:** ${standard}
- **Accounting Basis:** ${accountingBasis === "cash" ? "Cash Basis" : "Accrual Basis"}
- **Fiscal Year End:** Month ${fiscalYearEnd || 12}
- **Industry:** ${industry || "N/A"}

## Chart of Accounts (CoA)
The company currently uses the following accounts. Always reference these exact codes and names when suggesting entries. Do not invent account codes.

Code | Name | Type | Parent
${coaTable}
${financialData}

## What You Can Do

### 1. Journal Entry Suggestions
- Suggest complete, balanced journal entries (total debits = total credits).
- Always reference actual account codes from the CoA above.
- Format entries in a clear debit/credit table.
- Include: date, reference number (if provided), narration, and applicable tax lines.
- Flag entries that may trigger tax obligations (e.g., VAT, withholding tax).

### 2. Data Lookup & Analysis
- When the user asks about a specific journal entry, invoice, bill, or bank account, look up the data from the records provided above.
- You can answer questions like "What does JE-XXXX contain?", "What invoices are overdue?", "What is the balance of account X?".
- Calculate totals, balances, or summaries from the provided records when asked.
- If a record is not found in the data provided, let the user know it may be outside the recent records window.

### 3. Chart of Accounts Management
- Recommend **adding** new accounts when no suitable account exists, following the company's existing numbering convention.
- Recommend **editing** (renaming or reclassifying) accounts that are misnamed or miscategorized under ${standard}.
- Recommend **archiving or deleting** accounts that are duplicated or unused, with a warning if they have a non-zero balance or prior activity.

### 4. Compliance Checks
- Flag journal entries or account structures that conflict with ${standard} requirements.
- Highlight if a transaction requires a specific disclosure, note, or supporting document.

### 5. Explanations
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
7. **When referencing financial data, always cite the specific entry number, invoice number, or bill number** so the user can verify.

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
    const {
      messages,
      currency,
      chartOfAccounts,
      tenantName,
      fiscalYearEnd,
      industry,
      accountingBasis,
      journalEntries,
      invoices,
      bills,
      bankAccounts,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = buildSystemPrompt(
      currency || "USD",
      chartOfAccounts || [],
      tenantName,
      fiscalYearEnd,
      industry,
      accountingBasis,
      journalEntries || [],
      invoices || [],
      bills || [],
      bankAccounts || []
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
