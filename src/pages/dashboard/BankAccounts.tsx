import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
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
  Plus, Search, Pencil, Trash2, Upload, Loader2, Check, X, ExternalLink,
} from "lucide-react";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type BankAccount = Tables<"bank_accounts">;
type BankTransaction = Tables<"bank_transactions">;
type ChartAccount = Tables<"chart_of_accounts">;

interface ParsedTx {
  date: string;
  description: string;
  amount: number;
}

interface AISuggestion {
  transactionIndex: number;
  reference: string;
  description: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  status: "pending" | "approved" | "skipped";
  originalTx: ParsedTx;
}

/* ─── helpers ─── */
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

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
  const descIdx = lower.findIndex((h) => /desc|narr|memo|detail|particular/.test(h));
  const amtIdx = lower.findIndex((h) => /amount|sum|value/.test(h));
  const debitIdx = lower.findIndex((h) => /debit|withdrawal|dr/.test(h));
  const creditIdx = lower.findIndex((h) => /credit|deposit|cr/.test(h));
  return { dateIdx, descIdx, amtIdx, debitIdx, creditIdx };
}

/* ─────────────────────────────────── COMPONENT ─────────────────────────────────── */

export default function BankAccounts() {
  const { tenantId } = useTenant();
  const { user } = useAuth();
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
  const [importAccountId, setImportAccountId] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [colMap, setColMap] = useState<{ dateIdx: number; descIdx: number; amtIdx: number; debitIdx: number; creditIdx: number }>({ dateIdx: -1, descIdx: -1, amtIdx: -1, debitIdx: -1, creditIdx: -1 });
  const [dateFormat, setDateFormat] = useState("yyyy-mm-dd");
  const [parsedTxs, setParsedTxs] = useState<ParsedTx[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [approving, setApproving] = useState<number | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);

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
      return { date: convertDate(r[colMap.dateIdx] || "", dateFormat), description: r[colMap.descIdx] || "", amount };
    }).filter((t) => t.description || t.amount);
    setParsedTxs(txs);
  };

  /* — AI processing — */
  const generateSuggestions = async () => {
    if (!parsedTxs.length || !chartAccounts.length) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-bank-csv", {
        body: { transactions: parsedTxs, accounts: chartAccounts },
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
    setApproving(idx);
    try {
      // 1. Create journal entry
      const { data: je, error: jeErr } = await supabase.from("journal_entries").insert({
        entry_number: s.reference,
        entry_date: s.originalTx.date || new Date().toISOString().slice(0, 10),
        description: s.description,
        status: "posted",
        tenant_id: tenantId,
        created_by: user?.id ?? null,
        posted_at: new Date().toISOString(),
      } as TablesInsert<"journal_entries">).select("id").single();
      if (jeErr) throw jeErr;

      // 2. Create journal lines
      await supabase.from("journal_lines").insert([
        { journal_entry_id: je.id, account_id: s.debitAccountId, debit: s.amount, credit: 0, tenant_id: tenantId, description: s.description },
        { journal_entry_id: je.id, account_id: s.creditAccountId, debit: 0, credit: s.amount, tenant_id: tenantId, description: s.description },
      ]);

      // 3. Create bank transaction
      await supabase.from("bank_transactions").insert({
        bank_account_id: importAccountId,
        journal_entry_id: je.id,
        reference: s.reference,
        transaction_date: s.originalTx.date || new Date().toISOString().slice(0, 10),
        description: s.description,
        amount: s.amount,
        transaction_type: s.originalTx.amount >= 0 ? "credit" : "debit",
        tenant_id: tenantId,
      } as TablesInsert<"bank_transactions">);

      setSuggestions((prev) => prev.map((item, i) => i === idx ? { ...item, status: "approved" } : item));
      toast({ title: `Entry ${s.reference} approved` });
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
    } catch (err: any) {
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    } finally {
      setApproving(null);
    }
  }, [suggestions, tenantId, importAccountId, user, toast, qc]);

  const approveAll = async () => {
    setBulkApproving(true);
    for (let i = 0; i < suggestions.length; i++) {
      if (suggestions[i].status === "pending") {
        await approveEntry(i);
      }
    }
    setBulkApproving(false);
  };

  const updateSuggestion = (idx: number, field: keyof AISuggestion, value: any) => {
    setSuggestions((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const filtered = accounts.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()) || (a.institution ?? "").toLowerCase().includes(search.toLowerCase()));

  const accountName = (id: string) => chartAccounts.find((a) => a.id === id)?.name ?? "Unknown";

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
              <Button onClick={() => { resetForm(); setFormOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add Account</Button>
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
                      <TableCell className="text-right font-mono">{fmt(a.current_balance)}</TableCell>
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
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Reference</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Reconciled</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {transactions.map((t) => (
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
                            <TableCell className={`text-right font-mono ${t.amount >= 0 ? "text-accent" : "text-destructive"}`}>{fmt(t.amount)}</TableCell>
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
                      <Button onClick={approveAll} disabled={bulkApproving || !suggestions.some((s) => s.status === "pending")}>
                        {bulkApproving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Approving…</> : "Approve All Pending"}
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Description</TableHead><TableHead>Debit Account</TableHead><TableHead>Credit Account</TableHead><TableHead className="text-right">Amount</TableHead><TableHead />
                        </TableRow></TableHeader>
                        <TableBody>
                          {suggestions.map((s, i) => (
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
                              <TableCell>
                                {s.status === "pending" ? (
                                  <Input value={s.description} onChange={(e) => updateSuggestion(i, "description", e.target.value)} className="w-48" />
                                ) : s.description}
                              </TableCell>
                              <TableCell>
                                {s.status === "pending" ? (
                                  <Select value={s.debitAccountId} onValueChange={(v) => updateSuggestion(i, "debitAccountId", v)}>
                                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                                    <SelectContent>{chartAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                                  </Select>
                                ) : accountName(s.debitAccountId)}
                              </TableCell>
                              <TableCell>
                                {s.status === "pending" ? (
                                  <Select value={s.creditAccountId} onValueChange={(v) => updateSuggestion(i, "creditAccountId", v)}>
                                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                                    <SelectContent>{chartAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                                  </Select>
                                ) : accountName(s.creditAccountId)}
                              </TableCell>
                              <TableCell className="text-right">
                                {s.status === "pending" ? (
                                  <Input type="number" value={s.amount} onChange={(e) => updateSuggestion(i, "amount", parseFloat(e.target.value) || 0)} className="w-24 text-right font-mono" />
                                ) : <span className="font-mono">{fmt(s.amount)}</span>}
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
            <div><Label>Currency</Label><Input value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} placeholder="USD" /></div>
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
