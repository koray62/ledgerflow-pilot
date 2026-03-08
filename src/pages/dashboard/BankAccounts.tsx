import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useClosedFiscalYears } from "@/hooks/useClosedFiscalYears";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Search, Pencil, Trash2, Upload, Loader2, Check, X, ExternalLink, CalendarIcon,
} from "lucide-react";
import { format, isAfter, isBefore, startOfDay } from "date-fns";
import { cn, formatCurrency as fmtCurrency, SUPPORTED_CURRENCIES, formatDisplayDate } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type BankAccount = Tables<"bank_accounts">;
type BankTransaction = Tables<"bank_transactions">;
type ChartAccount = Tables<"chart_of_accounts">;

interface ParsedTx {
  date: string;
  description: string;
  detailedDescription?: string;
  amount: number;
}

interface AISuggestionLine {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

interface AISuggestion {
  transactionIndex: number;
  reference: string;
  description: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  lines?: AISuggestionLine[];
  status: "pending" | "approved" | "skipped";
  originalTx: ParsedTx;
}

/* ─── helpers ─── */
// fmt is now defined inside component to use defaultCurrency

const DATE_FORMATS = [
  { value: "yyyy-mm-dd", label: "YYYY-MM-DD (2026-02-22)" },
  { value: "dd/mm/yyyy", label: "DD/MM/YYYY (22/02/2026)" },
  { value: "mm/dd/yyyy", label: "MM/DD/YYYY (02/22/2026)" },
  { value: "dd-mm-yyyy", label: "DD-MM-YYYY (22-02-2026)" },
  { value: "mm-dd-yyyy", label: "MM-DD-YYYY (02-22-2026)" },
  { value: "dd.mm.yyyy", label: "DD.MM.YYYY (22.02.2026)" },
] as const;

function convertDate(raw: string, format: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return new Date().toISOString().slice(0, 10);
  let d: number, m: number, y: number;
  const parts = trimmed.split(/[\/\-\.]/);
  if (parts.length < 3) return trimmed; // fallback
  switch (format) {
    case "dd/mm/yyyy":
    case "dd-mm-yyyy":
    case "dd.mm.yyyy":
      [d, m, y] = parts.map(Number);
      break;
    case "mm/dd/yyyy":
    case "mm-dd-yyyy":
      [m, d, y] = parts.map(Number);
      break;
    case "yyyy-mm-dd":
    default:
      [y, m, d] = parts.map(Number);
      break;
  }
  if (y < 100) y += 2000;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || "";
  // Count occurrences of common delimiters in first line
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuote = false;
  for (const ch of firstLine) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (!inQuote && ch in counts) counts[ch]++;
  }
  // Pick the delimiter with the most occurrences
  if (counts[";"] > counts[","] && counts[";"] > counts["\t"]) return ";";
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  return ",";
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(text);
  const split = (line: string) => {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === delimiter && !inQuote) { result.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    result.push(cur.trim());
    return result;
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

function autoDetectColumns(headers: string[]) {
  const lower = headers.map((h) => h.toLowerCase());
  const dateIdx = lower.findIndex((h) => /date/.test(h));
  const descIdx = lower.findIndex((h) => /desc|narr|memo|particular/.test(h));
  const detailDescIdx = lower.findIndex((h, i) => i !== descIdx && /detail.*desc|full.*desc|remarks|additional/.test(h));
  const amtIdx = lower.findIndex((h) => /amount|sum|value/.test(h));
  const debitIdx = lower.findIndex((h) => /debit|withdrawal|dr/.test(h));
  const creditIdx = lower.findIndex((h) => /credit|deposit|cr/.test(h));
  return { dateIdx, descIdx, detailDescIdx, amtIdx, debitIdx, creditIdx };
}

/* ─────────────────────────────────── COMPONENT ─────────────────────────────────── */

export default function BankAccounts() {
  const { tenantId, defaultCurrency } = useTenant();
  const fmt = (n: number) => fmtCurrency(n, defaultCurrency);
  const { user } = useAuth();
  const { isDateInClosedYear } = useClosedFiscalYears();
  const { can } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  /* — state — */
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", institution: "", accountNumber: "", accountType: "checking", currency: "USD" });

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Import state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [colMap, setColMap] = useState<{ dateIdx: number; descIdx: number; detailDescIdx: number; amtIdx: number; debitIdx: number; creditIdx: number }>({ dateIdx: -1, descIdx: -1, detailDescIdx: -1, amtIdx: -1, debitIdx: -1, creditIdx: -1 });
  const [dateFormat, setDateFormat] = useState("yyyy-mm-dd");
  const [parsedTxs, setParsedTxs] = useState<ParsedTx[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [approving, setApproving] = useState<number | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [reviewFilters, setReviewFilters] = useState({ status: "", date: "", reference: "", description: "", debit: "", credit: "", amount: "" });
  const [txFilters, setTxFilters] = useState<{ dateFrom: Date | undefined; dateTo: Date | undefined; description: string; reference: string; type: string; amount: string; reconciled: string }>({ dateFrom: undefined, dateTo: undefined, description: "", reference: "", type: "", amount: "", reconciled: "" });

  // Cache suggestions per bank account — persisted to sessionStorage so they survive unmounts
  const CACHE_KEY = "bankImportCache";

  const readCache = useCallback((): Record<string, { suggestions: AISuggestion[]; parsedTxs: ParsedTx[]; csvHeaders?: string[]; csvRows?: string[][]; colMap?: typeof colMap }> => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }, []);

  const writeCache = useCallback((cache: Record<string, unknown>) => {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
  }, []);

  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;
  const parsedTxsRef = useRef(parsedTxs);
  parsedTxsRef.current = parsedTxs;
  const csvHeadersRef = useRef(csvHeaders);
  csvHeadersRef.current = csvHeaders;
  const csvRowsRef = useRef(csvRows);
  csvRowsRef.current = csvRows;
  const colMapRef = useRef(colMap);
  colMapRef.current = colMap;

  const [importAccountId, setImportAccountIdRaw] = useState<string | null>(null);

  // Persist current suggestions to sessionStorage whenever they change
  useEffect(() => {
    if (!importAccountId) return;
    const cache = readCache();
    if (suggestions.length > 0 || parsedTxs.length > 0) {
      cache[importAccountId] = { suggestions, parsedTxs, csvHeaders, csvRows, colMap };
      writeCache(cache);
    } else if (cache[importAccountId]) {
      // If everything was cleared (all approved), remove from cache
      delete cache[importAccountId];
      writeCache(cache);
    }
  }, [suggestions, parsedTxs, importAccountId, csvHeaders, csvRows, colMap, readCache, writeCache]);

  const setImportAccountId = useCallback((newId: string | null) => {
    setImportAccountIdRaw((prevId) => {
      // Save current state for previous account to sessionStorage
      if (prevId && (suggestionsRef.current.length > 0 || parsedTxsRef.current.length > 0)) {
        const cache = readCache();
        cache[prevId] = {
          suggestions: suggestionsRef.current,
          parsedTxs: parsedTxsRef.current,
          csvHeaders: csvHeadersRef.current,
          csvRows: csvRowsRef.current,
          colMap: colMapRef.current,
        };
        writeCache(cache);
      }
      // Restore cached state for new account (from sessionStorage)
      if (newId) {
        const cache = readCache();
        if (cache[newId]) {
          const cached = cache[newId];
          setSuggestions(cached.suggestions);
          setParsedTxs(cached.parsedTxs);
          if (cached.csvHeaders) setCsvHeaders(cached.csvHeaders);
          if (cached.csvRows) setCsvRows(cached.csvRows);
          if (cached.colMap) setColMap(cached.colMap);
        } else if (newId !== prevId) {
          setSuggestions([]);
          setParsedTxs([]);
        }
      } else if (newId !== prevId) {
        setSuggestions([]);
        setParsedTxs([]);
      }
      return newId;
    });
  }, [readCache, writeCache]);

  /* — queries — */
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["bank_accounts", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase.from("bank_accounts").select("*").eq("tenant_id", tenantId).is("deleted_at", null).order("name");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ["bank_transactions", tenantId, selectedAccountId],
    queryFn: async () => {
      if (!tenantId || !selectedAccountId) return [];
      const { data } = await supabase.from("bank_transactions").select("*").eq("tenant_id", tenantId).eq("bank_account_id", selectedAccountId).is("deleted_at", null).order("transaction_date", { ascending: false });
      return data ?? [];
    },
    enabled: !!tenantId && !!selectedAccountId,
  });

  const { data: chartAccounts = [] } = useQuery({
    queryKey: ["chart_of_accounts", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase.from("chart_of_accounts").select("*").eq("tenant_id", tenantId).is("deleted_at", null).eq("is_active", true).order("code");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase.from("vendors").select("id, name").eq("tenant_id", tenantId).is("deleted_at", null).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase.from("customers").select("id, name").eq("tenant_id", tenantId).is("deleted_at", null).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  /* — CRUD helpers — */
  const resetForm = () => { setFormData({ name: "", institution: "", accountNumber: "", accountType: "checking", currency: "USD" }); setEditId(null); };

  const openEdit = (a: BankAccount) => {
    setFormData({ name: a.name, institution: a.institution ?? "", accountNumber: a.account_number_last4 ?? "", accountType: a.account_type ?? "checking", currency: a.currency });
    setEditId(a.id);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!tenantId || !formData.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    const last4 = formData.accountNumber.slice(-4);
    if (editId) {
      await supabase.from("bank_accounts").update({ name: formData.name, institution: formData.institution || null, account_number_last4: last4 || null, account_type: formData.accountType, currency: formData.currency }).eq("id", editId);
    } else {
      await supabase.from("bank_accounts").insert({ name: formData.name, institution: formData.institution || null, account_number_last4: last4 || null, account_type: formData.accountType, currency: formData.currency, tenant_id: tenantId, created_by: user?.id ?? null });
    }
    qc.invalidateQueries({ queryKey: ["bank_accounts"] });
    setFormOpen(false);
    resetForm();
    toast({ title: editId ? "Account updated" : "Account created" });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("bank_accounts").update({ deleted_at: new Date().toISOString() }).eq("id", deleteId);
    qc.invalidateQueries({ queryKey: ["bank_accounts"] });
    setDeleteId(null);
    toast({ title: "Account deleted" });
  };

  /* — CSV handling — */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvRows(rows);
      const detected = autoDetectColumns(headers);
      setColMap(detected);
      setSuggestions([]);
      setParsedTxs([]);

      // Auto-detect date format from first data row
      if (detected.dateIdx >= 0 && rows.length > 0) {
        const sample = (rows[0][detected.dateIdx] || "").trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(sample)) {
          const p = sample.split("/").map(Number);
          setDateFormat(p[0] > 12 ? "dd/mm/yyyy" : p[1] > 12 ? "mm/dd/yyyy" : "dd/mm/yyyy");
        } else if (/^\d{2}-\d{2}-\d{4}$/.test(sample)) {
          const p = sample.split("-").map(Number);
          setDateFormat(p[0] > 12 ? "dd-mm-yyyy" : p[1] > 12 ? "mm-dd-yyyy" : "dd-mm-yyyy");
        } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(sample)) {
          setDateFormat("dd.mm.yyyy");
        } else {
          setDateFormat("yyyy-mm-dd");
        }
      }
      // Don't auto-parse — always show column mapping so user can confirm date format
    };
    reader.readAsText(file);
  };

  const applyColumnMapping = () => {
    const txs = csvRows.map((r) => {
      let amount = 0;
      if (colMap.amtIdx >= 0) {
        amount = parseFloat(r[colMap.amtIdx]?.replace(/[^0-9.\-]/g, "") || "0");
      } else if (colMap.debitIdx >= 0 && colMap.creditIdx >= 0) {
        const dr = parseFloat(r[colMap.debitIdx]?.replace(/[^0-9.\-]/g, "") || "0");
        const cr = parseFloat(r[colMap.creditIdx]?.replace(/[^0-9.\-]/g, "") || "0");
        amount = cr - dr;
      }
      const detailedDescription = colMap.detailDescIdx >= 0 ? (r[colMap.detailDescIdx] || "").trim() : undefined;
      return { date: convertDate(r[colMap.dateIdx] || "", dateFormat), description: r[colMap.descIdx] || "", detailedDescription: detailedDescription || undefined, amount };
    }).filter((t) => t.description || t.amount);
    setParsedTxs(txs);
  };

  /* — AI processing — */
  const generateSuggestions = async () => {
    if (!parsedTxs.length || !chartAccounts.length) return;
    setAiLoading(true);
    try {
      // Merge detailed description for AI context, but keep parsedTxs unchanged for storage
      const txsForAI = parsedTxs.map(tx => ({
        date: tx.date,
        description: tx.detailedDescription ? `${tx.description} | ${tx.detailedDescription}` : tx.description,
        amount: tx.amount,
      }));
      const { data, error } = await supabase.functions.invoke("process-bank-csv", {
        body: { transactions: txsForAI, accounts: chartAccounts, vendors, customers },
      });
      if (error) throw error;
      const sug: AISuggestion[] = (data.suggestions || []).map((s: any) => ({
        ...s,
        status: "pending" as const,
        originalTx: parsedTxs[s.transactionIndex],
      }));
      setSuggestions(sug);
    } catch (err: any) {
      toast({ title: "AI processing failed", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  /* — Approve — */
  const approveEntry = useCallback(async (idx: number) => {
    if (!tenantId || !importAccountId) return;
    const s = suggestions[idx];
    if (s.status !== "pending") return;
    const txDate = s.originalTx.date || new Date().toISOString().slice(0, 10);
    if (isDateInClosedYear(txDate)) {
      toast({ title: "Closed fiscal year", description: "Cannot create transactions in a closed fiscal year.", variant: "destructive" });
      return;
    }
    setApproving(idx);
    try {
      // --- Invoice auto-matching ---
      // Build merged description for matching (same merge logic as AI)
      const mergedDesc = s.originalTx.detailedDescription
        ? `${s.originalTx.description} | ${s.originalTx.detailedDescription}`
        : s.originalTx.description;
      const invMatches = mergedDesc.match(/INV-\d+/gi) || [];
      let matchedInvoice: Tables<"invoices"> | null = null;
      const arAccount = chartAccounts.find(
        (a) => a.account_type === "asset" && a.name.toLowerCase().includes("receivable")
      );

      if (invMatches.length > 0 && arAccount) {
        // Fetch candidate invoices (sent or overdue)
        const { data: candidateInvoices } = await supabase
          .from("invoices")
          .select("*")
          .eq("tenant_id", tenantId)
          .in("status", ["sent", "overdue"])
          .is("deleted_at", null);

        if (candidateInvoices?.length) {
          for (const invNum of invMatches) {
            const found = candidateInvoices.find(
              (inv) =>
                inv.invoice_number.toLowerCase() === invNum.toLowerCase() &&
                Math.abs(s.amount) === Number(inv.total_amount)
            );
            if (found) {
              matchedInvoice = found;
              break;
            }
          }
        }
      }

      // Determine entry details — override if invoice matched
      const isInvoicePayment = !!matchedInvoice && !!arAccount;
      const entryNumber = isInvoicePayment
        ? `JE-PAY-${matchedInvoice!.invoice_number}`
        : s.reference;
      const entryDescription = isInvoicePayment
        ? `Payment received for Invoice ${matchedInvoice!.invoice_number}`
        : s.description;
      // For invoice payment, use the AI-suggested debit account (bank CoA) as the debit side
      const bankCoAId = s.debitAccountId;

      // 1. Create journal entry
      const { data: je, error: jeErr } = await supabase.from("journal_entries").insert({
        entry_number: entryNumber,
        entry_date: s.originalTx.date || new Date().toISOString().slice(0, 10),
        description: entryDescription,
        status: "posted",
        tenant_id: tenantId,
        created_by: user?.id ?? null,
        posted_at: new Date().toISOString(),
      } as TablesInsert<"journal_entries">).select("id").single();
      if (jeErr) throw jeErr;

      // 2. Create journal lines
      if (isInvoicePayment) {
        // Payment entry: DR Bank, CR Accounts Receivable
        const paymentAmount = Number(matchedInvoice!.total_amount);
        await supabase.from("journal_lines").insert([
          {
            journal_entry_id: je.id,
            tenant_id: tenantId,
            account_id: bankCoAId,
            debit: paymentAmount,
            credit: 0,
            description: `Cash received — Invoice ${matchedInvoice!.invoice_number}`,
          },
          {
            journal_entry_id: je.id,
            tenant_id: tenantId,
            account_id: arAccount!.id,
            debit: 0,
            credit: paymentAmount,
            description: `AR cleared — Invoice ${matchedInvoice!.invoice_number}`,
          },
        ]);
      } else if (s.lines && s.lines.length > 0) {
        // Multi-line entry (e.g. revenue with VAT)
        await supabase.from("journal_lines").insert(
          s.lines.map((line) => ({
            journal_entry_id: je.id,
            account_id: line.accountId,
            debit: line.debit,
            credit: line.credit,
            tenant_id: tenantId,
            description: line.description || s.description,
          }))
        );
      } else {
        // Simple 2-line entry
        await supabase.from("journal_lines").insert([
          { journal_entry_id: je.id, account_id: s.debitAccountId, debit: s.amount, credit: 0, tenant_id: tenantId, description: s.description },
          { journal_entry_id: je.id, account_id: s.creditAccountId, debit: 0, credit: s.amount, tenant_id: tenantId, description: s.description },
        ]);
      }

      // 3. Create bank transaction
      await supabase.from("bank_transactions").insert({
        bank_account_id: importAccountId,
        journal_entry_id: je.id,
        reference: entryNumber,
        transaction_date: s.originalTx.date || new Date().toISOString().slice(0, 10),
        description: s.originalTx.description,
        amount: s.amount,
        transaction_type: s.originalTx.amount >= 0 ? "credit" : "debit",
        tenant_id: tenantId,
      } as TablesInsert<"bank_transactions">);

      // 4. If invoice matched, update invoice to paid
      if (isInvoicePayment) {
        await supabase
          .from("invoices")
          .update({
            payment_journal_entry_id: je.id,
            amount_paid: matchedInvoice!.total_amount,
            status: "paid",
          } as any)
          .eq("id", matchedInvoice!.id);
        qc.invalidateQueries({ queryKey: ["invoices"] });
      }

      setSuggestions((prev) => {
        const updated = prev.map((item, i) => i === idx ? { ...item, status: "approved" as const } : item);
        // Auto-clear when all entries are approved
        if (updated.every((item) => item.status === "approved" || item.status === "skipped")) {
          setTimeout(() => {
            setSuggestions([]);
            setParsedTxs([]);
            if (importAccountId) {
              const cache = readCache();
              delete cache[importAccountId];
              writeCache(cache);
            }
            toast({ title: "All entries processed", description: "The review table has been cleared." });
          }, 1500);
        }
        return updated;
      });

      const toastMsg = isInvoicePayment
        ? `Invoice ${matchedInvoice!.invoice_number} auto-matched and marked as paid`
        : `Entry ${s.reference} approved`;
      toast({ title: toastMsg });
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
    } catch (err: any) {
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    } finally {
      setApproving(null);
    }
  }, [suggestions, tenantId, importAccountId, user, toast, qc, chartAccounts, isDateInClosedYear, readCache, writeCache]);

  const updateSuggestion = (idx: number, field: keyof AISuggestion, value: any) => {
    setSuggestions((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const filtered = accounts.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()) || (a.institution ?? "").toLowerCase().includes(search.toLowerCase()));

  const accountName = (id: string) => chartAccounts.find((a) => a.id === id)?.name ?? "Unknown";

  const isReviewVisible = useCallback((s: AISuggestion) => {
    const f = reviewFilters;
    const low = (v: string) => v.toLowerCase();
    if (f.status && !low(s.status).includes(low(f.status))) return false;
    if (f.date && !s.originalTx.date.includes(f.date)) return false;
    if (f.reference && !low(s.reference).includes(low(f.reference))) return false;
    if (f.description && !low(s.description).includes(low(f.description))) return false;
    if (f.debit && !low(accountName(s.debitAccountId)).includes(low(f.debit))) return false;
    if (f.credit && !low(accountName(s.creditAccountId)).includes(low(f.credit))) return false;
    if (f.amount && !String(s.amount).includes(f.amount)) return false;
    return true;
  }, [reviewFilters, chartAccounts]);

  const approveAll = async () => {
    setBulkApproving(true);
    for (let i = 0; i < suggestions.length; i++) {
      if (suggestions[i].status === "pending" && isReviewVisible(suggestions[i])) {
        await approveEntry(i);
      }
    }
    setBulkApproving(false);
  };

  /* ─── RENDER ─── */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bank Accounts</h1>
        <p className="text-muted-foreground">Manage bank accounts, view transactions, and import CSV statements</p>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="import">Import CSV</TabsTrigger>
        </TabsList>

        {/* ═══════════ ACCOUNTS TAB ═══════════ */}
        <TabsContent value="accounts">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search accounts…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              {can("banking.edit") && <Button onClick={() => { resetForm(); setFormOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add Account</Button>}
            </div>

            {accountsLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : !filtered.length ? (
              <p className="text-center py-8 text-muted-foreground">{search ? "No accounts match your search" : "No bank accounts yet"}</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>Institution</TableHead><TableHead>Last 4</TableHead><TableHead>Type</TableHead><TableHead>Currency</TableHead><TableHead className="text-right">Balance</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{a.institution ?? "—"}</TableCell>
                      <TableCell className="font-mono">{a.account_number_last4 ? `••${a.account_number_last4}` : "—"}</TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{a.account_type}</Badge></TableCell>
                      <TableCell>{a.currency}</TableCell>
                      <TableCell className="text-right font-mono">{fmtCurrency(a.current_balance, a.currency)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteId(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ═══════════ TRANSACTIONS TAB ═══════════ */}
        <TabsContent value="transactions">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <Label>Bank Account</Label>
              <Select value={selectedAccountId ?? ""} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Select an account" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {!selectedAccountId ? (
              <p className="text-center py-8 text-muted-foreground">Select a bank account to view transactions</p>
            ) : txLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !transactions.length ? (
              <p className="text-center py-8 text-muted-foreground">No transactions for this account</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Reference</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Reconciled</TableHead><TableHead />
                  </TableRow>
                  <TableRow className="bg-muted/30">
                    <TableHead className="py-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className={cn("h-7 w-full justify-start text-xs font-normal gap-1", !txFilters.dateFrom && !txFilters.dateTo && "text-muted-foreground")}>
                            <CalendarIcon className="h-3 w-3 shrink-0" />
                            {txFilters.dateFrom || txFilters.dateTo
                              ? `${txFilters.dateFrom ? formatDisplayDate(txFilters.dateFrom, defaultCurrency, "short") : "…"} – ${txFilters.dateTo ? formatDisplayDate(txFilters.dateTo, defaultCurrency, "short") : "…"}`
                              : "Date…"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 space-y-0" align="start">
                          <div className="flex gap-2 p-3">
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">From</p>
                              <Calendar mode="single" selected={txFilters.dateFrom} onSelect={(d) => setTxFilters((f) => ({ ...f, dateFrom: d }))} className="p-2 pointer-events-auto" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">To</p>
                              <Calendar mode="single" selected={txFilters.dateTo} onSelect={(d) => setTxFilters((f) => ({ ...f, dateTo: d }))} className="p-2 pointer-events-auto" />
                            </div>
                          </div>
                          <div className="border-t border-border p-2 flex justify-end">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTxFilters((f) => ({ ...f, dateFrom: undefined, dateTo: undefined }))}>Clear</Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableHead>
                    <TableHead className="py-1"><Input placeholder="Filter…" value={txFilters.description} onChange={(e) => setTxFilters((f) => ({ ...f, description: e.target.value }))} className="h-7 text-xs" /></TableHead>
                    <TableHead className="py-1"><Input placeholder="Filter…" value={txFilters.reference} onChange={(e) => setTxFilters((f) => ({ ...f, reference: e.target.value }))} className="h-7 text-xs" /></TableHead>
                    <TableHead className="py-1"><Input placeholder="Filter…" value={txFilters.type} onChange={(e) => setTxFilters((f) => ({ ...f, type: e.target.value }))} className="h-7 text-xs" /></TableHead>
                    <TableHead className="py-1"><Input placeholder="Filter…" value={txFilters.amount} onChange={(e) => setTxFilters((f) => ({ ...f, amount: e.target.value }))} className="h-7 text-xs text-right" /></TableHead>
                    <TableHead className="py-1"><Input placeholder="Filter…" value={txFilters.reconciled} onChange={(e) => setTxFilters((f) => ({ ...f, reconciled: e.target.value }))} className="h-7 text-xs" /></TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions
                    .filter((t) => {
                      const f = txFilters;
                      if (f.dateFrom && isBefore(startOfDay(new Date(t.transaction_date + "T00:00:00")), startOfDay(f.dateFrom))) return false;
                      if (f.dateTo && isAfter(startOfDay(new Date(t.transaction_date + "T00:00:00")), startOfDay(f.dateTo))) return false;
                      if (f.description && !t.description.toLowerCase().includes(f.description.toLowerCase())) return false;
                      if (f.reference && !(t.reference ?? "").toLowerCase().includes(f.reference.toLowerCase())) return false;
                      if (f.type && !t.transaction_type.toLowerCase().includes(f.type.toLowerCase())) return false;
                      if (f.amount && !String(t.amount).includes(f.amount)) return false;
                      if (f.reconciled) {
                        const rv = f.reconciled.toLowerCase();
                        if (rv === "yes" || rv === "y" || rv === "true") { if (!t.is_reconciled) return false; }
                        else if (rv === "no" || rv === "n" || rv === "false") { if (t.is_reconciled) return false; }
                      }
                      return true;
                    })
                    .map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.transaction_date}</TableCell>
                      <TableCell>{t.description}</TableCell>
                      <TableCell className="font-mono text-xs">{t.reference ?? "—"}</TableCell>
                      <TableCell><Badge variant={t.transaction_type === "credit" ? "default" : "secondary"}>{t.transaction_type}</Badge></TableCell>
                      <TableCell className="text-right font-mono">{fmt(t.amount)}</TableCell>
                      <TableCell>{t.is_reconciled ? <Check className="h-4 w-4 text-accent" /> : <X className="h-4 w-4 text-muted-foreground" />}</TableCell>
                      <TableCell>
                        {t.journal_entry_id && (
                          <Button size="sm" variant="ghost" onClick={() => navigate("/dashboard/journal")}>
                            <ExternalLink className="h-3 w-3 mr-1" />Entry
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ═══════════ IMPORT TAB ═══════════ */}
        <TabsContent value="import">
          <Card className="p-6 space-y-6">
            {/* Step 1: Select account */}
            <div className="flex items-center gap-4">
              <Label>Target Bank Account</Label>
              <Select value={importAccountId ?? ""} onValueChange={setImportAccountId}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Step 2: Upload CSV */}
            {importAccountId && (
              <div className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-2">Upload a CSV bank statement</p>
                  <Input type="file" accept=".csv,text/csv,application/csv,application/vnd.ms-excel" onChange={handleFileUpload} className="max-w-xs mx-auto" />
                </div>

                {/* Column mapping */}
                {csvHeaders.length > 0 && !parsedTxs.length && (
                  <div className="space-y-3 border border-border rounded-lg p-4">
                    <p className="font-medium">Map CSV Columns</p>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                       <div>
                         <Label>Date Format</Label>
                         <Select value={dateFormat} onValueChange={setDateFormat}>
                           <SelectTrigger><SelectValue /></SelectTrigger>
                           <SelectContent>{DATE_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                         </Select>
                       </div>
                       <div>
                         <Label>Date Column</Label>
                        <Select value={String(colMap.dateIdx)} onValueChange={(v) => setColMap({ ...colMap, dateIdx: Number(v) })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{csvHeaders.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Description Column</Label>
                        <Select value={String(colMap.descIdx)} onValueChange={(v) => setColMap({ ...colMap, descIdx: Number(v) })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{csvHeaders.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Amount Column</Label>
                        <Select value={String(colMap.amtIdx)} onValueChange={(v) => setColMap({ ...colMap, amtIdx: Number(v) })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{csvHeaders.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Detailed Description (Optional)</Label>
                        <Select value={String(colMap.detailDescIdx)} onValueChange={(v) => setColMap({ ...colMap, detailDescIdx: Number(v) })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="-1">None</SelectItem>
                            {csvHeaders.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button onClick={applyColumnMapping}>Apply Mapping</Button>
                  </div>
                )}

                {/* Parsed preview */}
                {parsedTxs.length > 0 && !suggestions.length && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{parsedTxs.length} transactions parsed</p>
                      <Button onClick={generateSuggestions} disabled={aiLoading}>
                        {aiLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Processing…</> : "Generate Journal Entries with AI"}
                      </Button>
                    </div>
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {parsedTxs.slice(0, 20).map((t, i) => (
                          <TableRow key={i}>
                            <TableCell>{t.date}</TableCell>
                            <TableCell>{t.description}</TableCell>
                            <TableCell className={`text-right font-mono ${t.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                              {t.amount >= 0 ? `+${fmt(t.amount)}` : `−${fmt(Math.abs(t.amount))}`}
                            </TableCell>
                          </TableRow>
                        ))}
                        {parsedTxs.length > 20 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">…and {parsedTxs.length - 20} more</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* AI suggestions / review */}
                {suggestions.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">Review & Approve Journal Entries</p>
                      <Button onClick={approveAll} disabled={bulkApproving || !suggestions.some((s) => s.status === "pending" && isReviewVisible(s))}>
                        {bulkApproving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Approving…</> : "Approve All Filtered"}
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Description</TableHead><TableHead>Debit Account</TableHead><TableHead>Credit Account</TableHead><TableHead className="text-right">Amount</TableHead><TableHead />
                          </TableRow>
                          <TableRow>
                            <TableHead className="py-1"><Input placeholder="Filter…" value={reviewFilters.status} onChange={(e) => setReviewFilters(f => ({ ...f, status: e.target.value }))} className="h-7 text-xs w-24" /></TableHead>
                            <TableHead className="py-1"><Input placeholder="Filter…" value={reviewFilters.date} onChange={(e) => setReviewFilters(f => ({ ...f, date: e.target.value }))} className="h-7 text-xs w-28" /></TableHead>
                            <TableHead className="py-1"><Input placeholder="Filter…" value={reviewFilters.reference} onChange={(e) => setReviewFilters(f => ({ ...f, reference: e.target.value }))} className="h-7 text-xs w-28" /></TableHead>
                            <TableHead className="py-1"><Input placeholder="Filter…" value={reviewFilters.description} onChange={(e) => setReviewFilters(f => ({ ...f, description: e.target.value }))} className="h-7 text-xs w-40" /></TableHead>
                            <TableHead className="py-1"><Input placeholder="Filter…" value={reviewFilters.debit} onChange={(e) => setReviewFilters(f => ({ ...f, debit: e.target.value }))} className="h-7 text-xs w-36" /></TableHead>
                            <TableHead className="py-1"><Input placeholder="Filter…" value={reviewFilters.credit} onChange={(e) => setReviewFilters(f => ({ ...f, credit: e.target.value }))} className="h-7 text-xs w-36" /></TableHead>
                            <TableHead className="py-1"><Input placeholder="Filter…" value={reviewFilters.amount} onChange={(e) => setReviewFilters(f => ({ ...f, amount: e.target.value }))} className="h-7 text-xs w-24" /></TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {suggestions
                            .map((s, i) => ({ s, i }))
                            .filter(({ s }) => isReviewVisible(s))
                            .map(({ s, i }) => (
                            <TableRow key={i} className={s.status === "approved" ? "opacity-60" : ""}>
                              <TableCell>
                                <Badge variant={s.status === "approved" ? "default" : s.status === "skipped" ? "secondary" : "outline"} className="capitalize">
                                  {s.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {s.status === "pending" ? (
                                  <Input value={s.originalTx.date} onChange={(e) => { const updated = [...suggestions]; updated[i] = { ...s, originalTx: { ...s.originalTx, date: e.target.value } }; setSuggestions(updated); }} className="w-28" />
                                ) : s.originalTx.date}
                              </TableCell>
                              <TableCell>
                                {s.status === "pending" ? (
                                  <Input value={s.reference} onChange={(e) => updateSuggestion(i, "reference", e.target.value)} className="w-36 font-mono text-xs" />
                                ) : <span className="font-mono text-xs">{s.reference}</span>}
                              </TableCell>
                              <TableCell className="max-w-[300px]">
                                {s.status === "pending" ? (
                                  <textarea value={s.description} onChange={(e) => updateSuggestion(i, "description", e.target.value)} className="w-full min-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" rows={2} />
                                ) : <span className="whitespace-pre-wrap">{s.description}</span>}
                              </TableCell>
                              <TableCell>
                                {s.lines && s.lines.length > 0 ? (
                                  <div className="space-y-1">
                                    {s.lines.filter(l => l.debit > 0).map((l, li) => (
                                      <div key={li} className="text-xs">
                                        {s.status === "pending" ? (
                                          <Select value={l.accountId} onValueChange={(v) => {
                                            const updated = [...suggestions];
                                            const lines = [...(updated[i].lines || [])];
                                            const lineIdx = updated[i].lines!.indexOf(l);
                                            lines[lineIdx] = { ...l, accountId: v };
                                            updated[i] = { ...updated[i], lines };
                                            setSuggestions(updated);
                                          }}>
                                            <SelectTrigger className="w-44 h-7 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>{chartAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                                          </Select>
                                        ) : (
                                          <span>{accountName(l.accountId)} ({fmt(l.debit)})</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : s.status === "pending" ? (
                                  <Select value={s.debitAccountId} onValueChange={(v) => updateSuggestion(i, "debitAccountId", v)}>
                                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                                    <SelectContent>{chartAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                                  </Select>
                                ) : accountName(s.debitAccountId)}
                              </TableCell>
                              <TableCell>
                                {s.lines && s.lines.length > 0 ? (
                                  <div className="space-y-1">
                                    {s.lines.filter(l => l.credit > 0).map((l, li) => (
                                      <div key={li} className="text-xs">
                                        {s.status === "pending" ? (
                                          <div className="flex items-center gap-1">
                                            <Select value={l.accountId} onValueChange={(v) => {
                                              const updated = [...suggestions];
                                              const selectedAcct = chartAccounts.find(a => a.id === v);
                                              const isRevenueAcct = selectedAcct?.account_type === "revenue";
                                              // If changed away from revenue, collapse to simple 2-line entry
                                              if (!isRevenueAcct) {
                                                const debitLine = updated[i].lines?.find(ln => ln.debit > 0);
                                                updated[i] = {
                                                  ...updated[i],
                                                  lines: undefined,
                                                  debitAccountId: debitLine?.accountId || updated[i].debitAccountId,
                                                  creditAccountId: v,
                                                };
                                              } else {
                                                // Still revenue — just swap the account on the revenue line
                                                const lines = [...(updated[i].lines || [])];
                                                const lineIdx = updated[i].lines!.indexOf(l);
                                                lines[lineIdx] = { ...l, accountId: v };
                                                updated[i] = { ...updated[i], lines };
                                              }
                                              setSuggestions(updated);
                                            }}>
                                              <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                                              <SelectContent>{chartAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                            <span className="text-xs text-muted-foreground whitespace-nowrap">{fmt(l.credit)}</span>
                                          </div>
                                        ) : (
                                          <span>{accountName(l.accountId)} ({fmt(l.credit)})</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : s.status === "pending" ? (
                                  <Select value={s.creditAccountId} onValueChange={(v) => {
                                    const selectedAcct = chartAccounts.find(a => a.id === v);
                                    const isRevenueAcct = selectedAcct?.account_type === "revenue";
                                    if (isRevenueAcct && s.originalTx.amount > 0) {
                                      // Auto-expand to 3-line VAT split
                                      const gross = s.amount;
                                      const net = Math.round((gross / 1.20) * 100) / 100;
                                      const vat = Math.round((gross - net) * 100) / 100;
                                      const vatAccount = chartAccounts.find(a => a.name.toLowerCase().includes("vat payable") || a.name.toLowerCase().includes("output vat"));
                                      const updated = [...suggestions];
                                      updated[i] = {
                                        ...updated[i],
                                        lines: [
                                          { accountId: s.debitAccountId, debit: gross, credit: 0, description: "Bank deposit" },
                                          { accountId: v, debit: 0, credit: net, description: "Sales revenue (net)" },
                                          { accountId: vatAccount?.id || v, debit: 0, credit: vat, description: "VAT 20%" },
                                        ],
                                      };
                                      setSuggestions(updated);
                                    } else {
                                      updateSuggestion(i, "creditAccountId", v);
                                    }
                                  }}>
                                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                                    <SelectContent>{chartAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                                  </Select>
                                ) : accountName(s.creditAccountId)}
                              </TableCell>
                              <TableCell className="text-right">
                                {(() => {
                                  const isInflow = s.originalTx.amount >= 0;
                                  const colorClass = isInflow ? "text-green-600 dark:text-green-400" : "text-destructive";
                                  const arrow = isInflow ? "▲" : "▼";
                                  if (s.status === "pending") {
                                    return (
                                      <Input type="number" value={s.amount} onChange={(e) => updateSuggestion(i, "amount", parseFloat(e.target.value) || 0)} className={`w-28 text-right font-mono ${isInflow ? "border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-950/30" : "border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-950/30"}`} />
                                    );
                                  }
                                  return <span className={`font-mono ${colorClass}`}>{arrow} {fmt(s.amount)}</span>;
                                })()}
                              </TableCell>
                              <TableCell>
                                {s.status === "pending" && (
                                  <div className="flex gap-1">
                                    <Button size="sm" onClick={() => approveEntry(i)} disabled={approving === i}>
                                      {approving === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => updateSuggestion(i, "status", "skipped")}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══════════ ADD/EDIT DIALOG ═══════════ */}
      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Bank Account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Account Name *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Business Checking" /></div>
            <div><Label>Institution</Label><Input value={formData.institution} onChange={(e) => setFormData({ ...formData, institution: e.target.value })} placeholder="e.g. Chase Bank" /></div>
            <div><Label>Account Number / IBAN</Label><Input value={formData.accountNumber} onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })} placeholder="Only last 4 digits are stored" /></div>
            <div><Label>Account Type</Label>
              <Select value={formData.accountType} onValueChange={(v) => setFormData({ ...formData, accountType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                  <SelectItem value="credit">Credit Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFormOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSave}>{editId ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ DELETE CONFIRM ═══════════ */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bank account?</AlertDialogTitle>
            <AlertDialogDescription>This will soft-delete the account. Existing transactions will be preserved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
