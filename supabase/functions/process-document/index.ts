import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Auth check – get user from token
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { documentId } = await req.json();
    if (!documentId) {
      return new Response(JSON.stringify({ error: "documentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch document record
    const { data: doc, error: docErr } = await adminClient
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to processing
    await adminClient
      .from("documents")
      .update({ status: "processing" })
      .eq("id", documentId);

    // Download file from storage
    const { data: fileData, error: dlErr } = await adminClient.storage
      .from("tenant-documents")
      .download(doc.storage_path);

    if (dlErr || !fileData) {
      await adminClient
        .from("documents")
        .update({ status: "failed", error_message: "Could not download file from storage" })
        .eq("id", documentId);
      return new Response(JSON.stringify({ error: "File download failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert file to base64 for vision model
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = doc.mime_type || "application/pdf";

    // Fetch tenant's chart of accounts for account suggestion
    const { data: accounts } = await adminClient
      .from("chart_of_accounts")
      .select("id, code, name, account_type")
      .eq("tenant_id", doc.tenant_id)
      .is("deleted_at", null)
      .eq("is_active", true);

    const accountList = (accounts || [])
      .map((a: any) => `${a.code} - ${a.name} (${a.account_type})`)
      .join("\n");

    // Call Lovable AI with vision to extract invoice data
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert accounting OCR assistant. Extract structured data from invoices and receipts. Be precise with amounts and dates.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              {
                type: "text",
                text: `Extract the following from this document image:
- vendor_name: The company/vendor that issued this document
- document_type: "invoice" or "receipt"
- document_number: Invoice/receipt number
- document_date: Date in YYYY-MM-DD format
- due_date: Due date in YYYY-MM-DD if present, null otherwise
- currency: 3-letter currency code (default USD)
- subtotal: Subtotal amount as number
- tax_amount: Tax amount as number (0 if not present)
- total_amount: Total amount as number
- line_items: Array of {description, quantity, unit_price, amount}
- notes: Any additional notes or payment instructions
- confidence: Your overall confidence in the extraction from 0.0 to 1.0

Also, suggest the best matching expense/liability account from this chart of accounts:
${accountList}

Return the suggested account code and name as "suggested_account_code" and "suggested_account_name".`,
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_document_data",
              description: "Extract structured financial data from a document image",
              parameters: {
                type: "object",
                properties: {
                  vendor_name: { type: "string" },
                  document_type: { type: "string", enum: ["invoice", "receipt"] },
                  document_number: { type: "string" },
                  document_date: { type: "string" },
                  due_date: { type: "string", nullable: true },
                  currency: { type: "string" },
                  subtotal: { type: "number" },
                  tax_amount: { type: "number" },
                  total_amount: { type: "number" },
                  line_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        quantity: { type: "number" },
                        unit_price: { type: "number" },
                        amount: { type: "number" },
                      },
                      required: ["description", "amount"],
                    },
                  },
                  notes: { type: "string" },
                  confidence: { type: "number" },
                  suggested_account_code: { type: "string" },
                  suggested_account_name: { type: "string" },
                },
                required: ["vendor_name", "total_amount", "confidence"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_document_data" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);

      const status = aiResponse.status === 429 ? "failed" : aiResponse.status === 402 ? "failed" : "failed";
      const msg = aiResponse.status === 429
        ? "Rate limit exceeded. Please try again later."
        : aiResponse.status === 402
        ? "AI credits exhausted. Please add funds."
        : `AI extraction failed (${aiResponse.status})`;

      await adminClient
        .from("documents")
        .update({ status, error_message: msg })
        .eq("id", documentId);

      return new Response(JSON.stringify({ error: msg }), {
        status: aiResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      await adminClient
        .from("documents")
        .update({ status: "failed", error_message: "AI did not return structured data" })
        .eq("id", documentId);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    const confidence = Math.min(Math.max(extracted.confidence ?? 0, 0), 1);
    const processingTime = Date.now() - startTime;

    // Find suggested account ID
    let suggestedAccountId: string | null = null;
    if (extracted.suggested_account_code && accounts) {
      const match = accounts.find((a: any) => a.code === extracted.suggested_account_code);
      if (match) suggestedAccountId = match.id;
    }

    // Determine status based on confidence
    const finalStatus = confidence >= 0.85 ? "completed" : "review_required";

    // Update document with extracted data
    await adminClient
      .from("documents")
      .update({
        status: finalStatus,
        extracted_data: extracted,
        ocr_confidence: Math.round(confidence * 100),
        suggested_vendor: extracted.vendor_name || null,
        suggested_amount: extracted.total_amount || null,
        suggested_account_id: suggestedAccountId,
        processing_time_ms: processingTime,
        error_message: null,
      })
      .eq("id", documentId);

    return new Response(
      JSON.stringify({
        success: true,
        status: finalStatus,
        confidence: Math.round(confidence * 100),
        extracted,
        processing_time_ms: processingTime,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("process-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
