import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { formatCurrency as fmtCurrency, SUPPORTED_CURRENCIES, formatDisplayDate } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useClosedFiscalYears } from "@/hooks/useClosedFiscalYears";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Eye, CreditCard, Printer, BookOpen, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/* ─── types ─── */
interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  account_id: string;
}

const emptyLine = (): InvoiceLine => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unit_price: 0,
  amount: 0,
  account_id: "",
});

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelled: "bg-muted text-muted-foreground line-through",
};

// fmt is now defined inside component to use defaultCurrency

const TAX_RATE = 0.2;

/* ═══════════════════════════ COMPONENT ═══════════════════════════ */
const Invoices = () => {
  const { tenantId, defaultCurrency } = useTenant();
  const { user } = useAuth();
  const { isDateInClosedYear } = useClosedFiscalYears();
  const { can } = usePermissions();
  const fmt = (n: number, currency?: string) => fmtCurrency(n, currency ?? defaultCurrency);
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentBankId, setPaymentBankId] = useState("");

  /* form state */
  const [customerId, setCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [invoiceCurrency, setInvoiceCurrency] = useState(defaultCurrency);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const previewRef = useRef<HTMLDivElement>(null);

  /* ─── queries ─── */
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customers(name, email, address, tax_id, phone)")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: invoiceLines = [] } = useQuery({
    queryKey: ["invoice_lines", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_lines" as any)
        .select("*")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!tenantId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .is("deleted_at", null);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["chart_of_accounts", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("code");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank_accounts", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .is("deleted_at", null);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { data: tenant } = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("*").eq("id", tenantId!).single();
      return data;
    },
    enabled: !!tenantId,
  });

  const [tenantLogoUrl, setTenantLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!tenant?.logo_url) { setTenantLogoUrl(null); return; }
    const storedLogo = tenant.logo_url as string;
    const path = storedLogo.includes("/storage/v1/")
      ? storedLogo.split("/tenant-documents/").pop() ?? storedLogo
      : storedLogo;
    supabase.storage.from("tenant-documents").createSignedUrl(path, 3600).then(({ data }) => {
      setTenantLogoUrl(data?.signedUrl ?? null);
    });
  }, [tenant?.logo_url]);

  /* ─── helpers ─── */
  const revenueAccounts = accounts.filter((a) => a.account_type === "revenue");
  const arAccount = accounts.find(
    (a) => a.account_type === "asset" && a.name.toLowerCase().includes("receivable")
  );
  const cashParent = accounts.find((a) => a.account_type === "asset" && a.code === "1000");
  const cashChildIds = new Set(
    cashParent ? accounts.filter((a) => a.parent_id === cashParent.id).map((a) => a.id) : []
  );
  const cashBankAccounts = accounts.filter(
    (a) =>
      a.account_type === "asset" &&
      a.id !== cashParent?.id &&
      (a.parent_id === cashParent?.id || cashChildIds.has(a.parent_id ?? ""))
  );
  const vatAccount = accounts.find(
    (a) =>
      a.account_type === "liability" &&
      (a.name.toLowerCase().includes("vat") || a.name.toLowerCase().includes("tax payable"))
  );

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const taxAmount = Math.round(subtotal * TAX_RATE * 100) / 100;
  const totalAmount = subtotal + taxAmount;

  const updateLine = (idx: number, field: keyof InvoiceLine, value: any) => {
    setLines((prev) => {
      const next = [...prev];
      const line = { ...next[idx], [field]: value };
      if (field === "quantity" || field === "unit_price") {
        line.amount = Math.round(line.quantity * line.unit_price * 100) / 100;
      }
      next[idx] = line;
      return next;
    });
  };

  const resetForm = () => {
    setEditId(null);
    setCustomerId("");
    setInvoiceDate(format(new Date(), "yyyy-MM-dd"));
    setDueDate("");
    setNotes("");
    setLines([emptyLine()]);
    setInvoiceCurrency(defaultCurrency);
    setErrors([]);
  };

  const openNew = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = async (id: string) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return;
    setEditId(id);
    setCustomerId(inv.customer_id ?? "");
    setInvoiceDate(inv.invoice_date);
    setDueDate(inv.due_date);
    setInvoiceCurrency((inv as any).currency ?? defaultCurrency);
    setNotes(inv.notes ?? "");

    const invLines = invoiceLines.filter((l: any) => l.invoice_id === id);
    setLines(
      invLines.length > 0
        ? invLines.map((l: any) => ({
            id: l.id,
            description: l.description,
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
            amount: Number(l.amount),
            account_id: l.account_id ?? "",
          }))
        : [emptyLine()]
    );
    setErrors([]);
    setFormOpen(true);
  };

  /* ─── generate next invoice number ─── */
  const nextInvoiceNumber = () => {
    const year = new Date().getFullYear();
    const prefix = `LP${year}`;
    const nums = invoices
      .filter((i) => i.invoice_number.startsWith(prefix))
      .map((i) => {
        const seq = i.invoice_number.slice(prefix.length);
        return seq ? parseInt(seq, 10) : 0;
      });
    const max = nums.length > 0 ? Math.max(...nums) : 100;
    return `${prefix}${String(max + 1).padStart(6, "0")}`;
  };

  /* ─── validate ─── */
  const validate = () => {
    const errs: string[] = [];
    if (!customerId) errs.push("Select a customer");
    if (!dueDate) errs.push("Due date is required");
    if (invoiceDate && dueDate && new Date(invoiceDate) > new Date(dueDate)) errs.push("Invoice date cannot be later than the due date");
    if (invoiceDate && isDateInClosedYear(invoiceDate)) errs.push("Cannot create invoices in a closed fiscal year.");
    if (lines.length === 0) errs.push("Add at least one line item");
    lines.forEach((l, i) => {
      if (!l.description) errs.push(`Line ${i + 1}: description required`);
      if (l.quantity <= 0) errs.push(`Line ${i + 1}: quantity must be > 0`);
      if (l.unit_price <= 0) errs.push(`Line ${i + 1}: unit price must be > 0`);
    });
    if (!arAccount) errs.push("No 'Accounts Receivable' account found in chart of accounts");
    if (!vatAccount) errs.push("No VAT/Tax Payable liability account found");
    setErrors(errs);
    return errs.length === 0;
  };

  /* ─── save invoice + journal entry ─── */
  const handleSave = useCallback(async () => {
    if (!validate() || !tenantId || !user) return;
    setSaving(true);
    try {
      const invoiceNumber = editId
        ? invoices.find((i) => i.id === editId)!.invoice_number
        : nextInvoiceNumber();

      /* upsert invoice */
      const invoicePayload = {
        tenant_id: tenantId,
        customer_id: customerId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate,
        notes: notes || null,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        currency: invoiceCurrency,
        status: "sent" as const,
        created_by: user.id,
      } as any;

      let invoiceId = editId;
      if (editId) {
        const { error } = await supabase.from("invoices").update(invoicePayload).eq("id", editId);
        if (error) throw error;
        /* delete old lines */
        await supabase.from("invoice_lines" as any).delete().eq("invoice_id", editId);
      } else {
        const { data, error } = await supabase
          .from("invoices")
          .insert(invoicePayload)
          .select("id")
          .single();
        if (error) throw error;
        invoiceId = data.id;
      }

      /* insert lines */
      const lineRows = lines.map((l) => ({
        invoice_id: invoiceId!,
        tenant_id: tenantId,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        amount: l.amount,
        account_id: l.account_id || null,
      }));
      const { error: lineErr } = await supabase.from("invoice_lines" as any).insert(lineRows);
      if (lineErr) throw lineErr;

      /* create journal entry (AR) — only for new invoices */
      if (!editId) {
        const entryNum = `JE-INV-${invoiceNumber}`;
        const { data: je, error: jeErr } = await supabase
          .from("journal_entries")
          .insert({
            tenant_id: tenantId,
            entry_number: entryNum,
            entry_date: invoiceDate,
            description: `Invoice ${invoiceNumber} — Accounts Receivable`,
            status: "posted",
            created_by: user.id,
            posted_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (jeErr) throw jeErr;

        /* determine revenue account — use first line's account or first revenue account */
        const revenueAccountId =
          lines[0]?.account_id || revenueAccounts[0]?.id;

        const journalLines: any[] = [
          {
            journal_entry_id: je.id,
            tenant_id: tenantId,
            account_id: arAccount!.id,
            debit: totalAmount,
            credit: 0,
            description: `AR for Invoice ${invoiceNumber}`,
          },
        ];

        /* group lines by account for revenue credits */
        const accountGroups = new Map<string, number>();
        for (const l of lines) {
          const acctId = l.account_id || revenueAccountId;
          if (acctId) {
            accountGroups.set(acctId, (accountGroups.get(acctId) ?? 0) + l.amount);
          }
        }
        for (const [acctId, amt] of accountGroups) {
          journalLines.push({
            journal_entry_id: je.id,
            tenant_id: tenantId,
            account_id: acctId,
            debit: 0,
            credit: amt,
            description: `Revenue for Invoice ${invoiceNumber}`,
          });
        }

        /* VAT line */
        if (vatAccount && taxAmount > 0) {
          journalLines.push({
            journal_entry_id: je.id,
            tenant_id: tenantId,
            account_id: vatAccount.id,
            debit: 0,
            credit: taxAmount,
            description: `VAT for Invoice ${invoiceNumber}`,
          });
        }

        await supabase.from("journal_lines").insert(journalLines);

        /* link journal entry to invoice */
        await supabase
          .from("invoices")
          .update({ journal_entry_id: je.id })
          .eq("id", invoiceId!);
      }

      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice_lines"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      toast({ title: editId ? "Invoice updated" : "Invoice created & posted" });
      setFormOpen(false);
      resetForm();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [tenantId, user, customerId, invoiceDate, dueDate, notes, lines, editId, subtotal, taxAmount, totalAmount]);

  /* ─── record payment ─── */
  const handleRecordPayment = async () => {
    if (!paymentInvoiceId || !paymentBankId || !tenantId || !user) return;
    const inv = invoices.find((i) => i.id === paymentInvoiceId);
    if (!inv || !arAccount) return;

    setSaving(true);
    try {
      const selectedCashAcct = accounts.find((a) => a.id === paymentBankId);
      if (!selectedCashAcct) throw new Error("Selected cash/bank account not found in chart of accounts");

      const entryNum = `JE-PAY-${inv.invoice_number}`;
      const { data: je, error: jeErr } = await supabase
        .from("journal_entries")
        .insert({
          tenant_id: tenantId,
          entry_number: entryNum,
          entry_date: format(new Date(), "yyyy-MM-dd"),
          description: `Payment received for Invoice ${inv.invoice_number}`,
          status: "posted",
          created_by: user.id,
          posted_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (jeErr) throw jeErr;

      await supabase.from("journal_lines").insert([
        {
          journal_entry_id: je.id,
          tenant_id: tenantId,
          account_id: selectedCashAcct.id,
          debit: Number(inv.total_amount),
          credit: 0,
          description: `Cash received — Invoice ${inv.invoice_number}`,
        },
        {
          journal_entry_id: je.id,
          tenant_id: tenantId,
          account_id: arAccount.id,
          debit: 0,
          credit: Number(inv.total_amount),
          description: `AR cleared — Invoice ${inv.invoice_number}`,
        },
      ]);

      await supabase
        .from("invoices")
        .update({
          payment_journal_entry_id: je.id,
          amount_paid: inv.total_amount,
          status: "paid",
        } as any)
        .eq("id", paymentInvoiceId);

      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      toast({ title: "Payment recorded", description: `Invoice ${inv.invoice_number} marked as paid` });
      setPaymentOpen(false);
      setPaymentInvoiceId(null);
      setPaymentBankId("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /* ─── cancel invoice ─── */
  const handleCancelInvoice = async (invoiceId: string) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv || !tenantId || !user) return;
    setSaving(true);
    try {
      const jeIds = [inv.journal_entry_id, inv.payment_journal_entry_id].filter(Boolean) as string[];

      for (const jeId of jeIds) {
        /* delete journal lines first (FK constraint) */
        await supabase.from("journal_lines").delete().eq("journal_entry_id", jeId);
        await supabase.from("journal_entries").delete().eq("id", jeId);
      }

      await supabase
        .from("invoices")
        .update({ status: "cancelled", journal_entry_id: null, payment_journal_entry_id: null } as any)
        .eq("id", invoiceId);

      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      qc.invalidateQueries({ queryKey: ["journal_lines"] });
      toast({ title: "Invoice cancelled", description: `Invoice ${inv.invoice_number} cancelled and all journal entries deleted.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /* ─── PDF export ─── */
  const exportPdf = async () => {
    if (!previewRef.current) return;
    const canvas = await html2canvas(previewRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let position = 0;
    let remaining = imgH;

    while (remaining > 0) {
      if (position > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, -position, imgW, imgH);
      position += pageH;
      remaining -= pageH;
    }

    const inv = invoices.find((i) => i.id === previewInvoiceId);
    pdf.save(`${inv?.invoice_number ?? "invoice"}.pdf`);
  };

  /* ─── filter ─── */
  const filtered = invoices.filter((inv) => {
    const matchSearch =
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      (inv.customers as any)?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  /* ─── preview data ─── */
  const previewInvoice = invoices.find((i) => i.id === previewInvoiceId);
  const previewLines = invoiceLines.filter((l: any) => l.invoice_id === previewInvoiceId);

  /* ═══════════════════════════ RENDER ═══════════════════════════ */
  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground">Create and manage customer invoices</p>
        </div>
        {can("invoices.edit") && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> New Invoice
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice List */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No invoices found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{(inv.customers as any)?.name ?? "—"}</TableCell>
                    <TableCell>{formatDisplayDate(inv.invoice_date, defaultCurrency)}</TableCell>
                    <TableCell>{formatDisplayDate(inv.due_date, defaultCurrency)}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[inv.status] ?? ""} variant="secondary">
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmt(Number(inv.total_amount), inv.currency)}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setPreviewInvoiceId(inv.id);
                          setPreviewOpen(true);
                        }}
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(inv.status === "sent" || inv.status === "overdue") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setPaymentInvoiceId(inv.id);
                            setPaymentBankId("");
                            setPaymentOpen(true);
                          }}
                          title="Record Payment"
                        >
                          <CreditCard className="h-4 w-4" />
                        </Button>
                      )}
                      {(inv.status === "sent" || inv.status === "overdue") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCancelInvoice(inv.id)}
                          title="Cancel Invoice"
                          disabled={saving}
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                      {inv.status === "draft" && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(inv.id)} title="Edit">
                          <Search className="h-4 w-4" />
                        </Button>
                      )}
                      {inv.journal_entry_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/dashboard/journal?edit=${inv.journal_entry_id}&from=invoices`)}
                          title="View Accrual Journal Entry"
                        >
                          <BookOpen className="h-4 w-4" />
                        </Button>
                      )}
                      {inv.payment_journal_entry_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/dashboard/journal?edit=${inv.payment_journal_entry_id}&from=invoices`)}
                          title="View Payment Journal Entry"
                        >
                          <BookOpen className="h-4 w-4 text-emerald-600" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ═══ Invoice Form Dialog ═══ */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) resetForm(); setFormOpen(o); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Invoice" : "New Invoice"}</DialogTitle>
            <DialogDescription>
              {editId ? "Update invoice details" : "Create a new invoice and auto-generate journal entries"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Invoice Date</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={invoiceCurrency} onValueChange={setInvoiceCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" />
            </div>
          </div>

          {/* Line items */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-base font-semibold">Line Items</Label>
              <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus className="h-3 w-3 mr-1" /> Add Line
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%]">Description</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="w-20">Qty</TableHead>
                  <TableHead className="w-28">Unit Price</TableHead>
                  <TableHead className="w-28 text-right">Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, idx) => (
                  <TableRow key={line.id}>
                    <TableCell className="p-1">
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(idx, "description", e.target.value)}
                        placeholder="Description"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Select value={line.account_id} onValueChange={(v) => updateLine(idx, "account_id", v)}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Account" />
                        </SelectTrigger>
                        <SelectContent>
                          {revenueAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        min={0}
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))}
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.unit_price}
                        onChange={(e) => updateLine(idx, "unit_price", Number(e.target.value))}
                      />
                    </TableCell>
                    <TableCell className="p-1 text-right font-mono">{fmt(line.amount, invoiceCurrency)}</TableCell>
                    <TableCell className="p-1">
                      {lines.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Totals */}
            <div className="flex flex-col items-end mt-3 space-y-1 text-sm">
              <div className="flex gap-8">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono w-28 text-right">{fmt(subtotal, invoiceCurrency)}</span>
              </div>
              <div className="flex gap-8">
                <span className="text-muted-foreground">VAT (20%)</span>
                <span className="font-mono w-28 text-right">{fmt(taxAmount, invoiceCurrency)}</span>
              </div>
              <div className="flex gap-8 font-bold text-base border-t border-border pt-1">
                <span>Total</span>
                <span className="font-mono w-28 text-right">{fmt(totalAmount, invoiceCurrency)}</span>
              </div>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive space-y-1">
              {errors.map((e, i) => <p key={i}>• {e}</p>)}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editId ? "Update Invoice" : "Create & Post Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Payment Dialog ═══ */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Select the bank account that received the payment for invoice{" "}
              {invoices.find((i) => i.id === paymentInvoiceId)?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Cash / Bank Account</Label>
            <Select value={paymentBankId} onValueChange={setPaymentBankId}>
              <SelectTrigger><SelectValue placeholder="Select cash/bank account" /></SelectTrigger>
              <SelectContent>
                {cashBankAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Amount: <span className="font-mono font-semibold">
                {(() => { const inv = invoices.find((i) => i.id === paymentInvoiceId); return fmt(Number(inv?.total_amount ?? 0), inv?.currency); })()}
              </span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={!paymentBankId || saving}>
              {saving ? "Recording…" : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Invoice Preview Dialog ═══ */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Invoice Preview</DialogTitle>
            <DialogDescription>
              Preview and export invoice {previewInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>

          {previewInvoice && (
            <>
              {/* A4 container — 210mm × 297mm ratio */}
              <div
                ref={previewRef}
                className="mx-auto bg-white text-black"
                style={{
                  width: "210mm",
                  minHeight: "297mm",
                  padding: "20mm 20mm 15mm 20mm",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  fontSize: "10pt",
                  lineHeight: "1.5",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* ── Logo top-left ── */}
                {tenantLogoUrl && (
                  <div style={{ marginBottom: "16px" }}>
                    <img
                      src={tenantLogoUrl}
                      alt="Company Logo"
                      style={{ maxWidth: "180px", maxHeight: "180px", objectFit: "contain", borderRadius: "6px" }}
                      crossOrigin="anonymous"
                    />
                  </div>
                )}

                {/* ── Header: company vs INVOICE title ── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", borderBottom: "3px solid #1a1a2e", paddingBottom: "16px" }}>
                  <div>
                    <h2 style={{ fontSize: "16pt", fontWeight: 700, margin: 0, color: "#1a1a2e" }}>
                      {tenant?.name ?? "Company"}
                    </h2>
                    {tenant?.address && (
                      <p style={{ margin: "2px 0 0", fontSize: "9pt", color: "#555" }}>{tenant.address}</p>
                    )}
                    {tenant?.tax_id && (
                      <p style={{ margin: "2px 0 0", fontSize: "9pt", color: "#555" }}>Tax ID: {tenant.tax_id}</p>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <h3 style={{ fontSize: "22pt", fontWeight: 800, margin: 0, color: "#1a1a2e", letterSpacing: "2px" }}>
                      INVOICE
                    </h3>
                    <p style={{ margin: "4px 0 0", fontSize: "11pt", fontWeight: 600, color: "#333" }}>
                      {previewInvoice.invoice_number}
                    </p>
                  </div>
                </div>

                {/* ── Bill To / Invoice Details ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "28px" }}>
                  <div style={{ background: "#f9fafb", borderRadius: "6px", padding: "14px" }}>
                    <p style={{ fontSize: "8pt", fontWeight: 700, textTransform: "uppercase", color: "#888", letterSpacing: "1px", margin: "0 0 6px" }}>
                      Bill To
                    </p>
                    <p style={{ fontWeight: 600, fontSize: "11pt", margin: "0 0 2px", color: "#1a1a2e" }}>
                      {(previewInvoice.customers as any)?.name}
                    </p>
                    {(previewInvoice.customers as any)?.address && (
                      <p style={{ margin: "2px 0", fontSize: "9pt", color: "#555" }}>
                        {(previewInvoice.customers as any).address}
                      </p>
                    )}
                    {(previewInvoice.customers as any)?.tax_id && (
                      <p style={{ margin: "2px 0", fontSize: "9pt", color: "#555" }}>
                        Tax ID: {(previewInvoice.customers as any).tax_id}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <table style={{ marginLeft: "auto", borderCollapse: "collapse", fontSize: "9pt" }}>
                      <tbody>
                        <tr>
                          <td style={{ padding: "3px 12px 3px 0", color: "#888", fontWeight: 600 }}>Invoice Date</td>
                          <td style={{ padding: "3px 0", fontWeight: 500 }}>{formatDisplayDate(previewInvoice.invoice_date, defaultCurrency)}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "3px 12px 3px 0", color: "#888", fontWeight: 600 }}>Due Date</td>
                          <td style={{ padding: "3px 0", fontWeight: 500 }}>{formatDisplayDate(previewInvoice.due_date, defaultCurrency)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Line Items Table ── */}
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "24px" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #1a1a2e" }}>
                      <th style={{ textAlign: "left", padding: "8px 6px", fontSize: "8pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#1a1a2e" }}>
                        Description
                      </th>
                      <th style={{ textAlign: "right", padding: "8px 6px", fontSize: "8pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#1a1a2e", width: "60px" }}>
                        Qty
                      </th>
                      <th style={{ textAlign: "right", padding: "8px 6px", fontSize: "8pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#1a1a2e", width: "100px" }}>
                        Unit Price
                      </th>
                      <th style={{ textAlign: "right", padding: "8px 6px", fontSize: "8pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#1a1a2e", width: "100px" }}>
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewLines.map((l: any, idx: number) => (
                      <tr key={l.id} style={{ borderBottom: "1px solid #e5e7eb", backgroundColor: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "8px 6px", fontSize: "9pt" }}>{l.description}</td>
                        <td style={{ padding: "8px 6px", textAlign: "right", fontSize: "9pt" }}>{Number(l.quantity)}</td>
                        <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace", fontSize: "9pt" }}>{fmt(Number(l.unit_price), previewInvoice?.currency)}</td>
                        <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace", fontSize: "9pt" }}>{fmt(Number(l.amount), previewInvoice?.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* ── Totals ── */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <table style={{ borderCollapse: "collapse", minWidth: "220px" }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: "4px 16px 4px 0", fontSize: "9pt", color: "#555" }}>Subtotal</td>
                        <td style={{ padding: "4px 0", textAlign: "right", fontFamily: "monospace", fontSize: "9pt" }}>
                          {fmt(Number(previewInvoice.subtotal), previewInvoice?.currency)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: "4px 16px 4px 0", fontSize: "9pt", color: "#555" }}>VAT (20%)</td>
                        <td style={{ padding: "4px 0", textAlign: "right", fontFamily: "monospace", fontSize: "9pt" }}>
                          {fmt(Number(previewInvoice.tax_amount), previewInvoice?.currency)}
                        </td>
                      </tr>
                      <tr style={{ borderTop: "2px solid #1a1a2e" }}>
                        <td style={{ padding: "8px 16px 4px 0", fontSize: "12pt", fontWeight: 700, color: "#1a1a2e" }}>
                          Total Due
                        </td>
                        <td style={{ padding: "8px 0 4px", textAlign: "right", fontFamily: "monospace", fontSize: "12pt", fontWeight: 700, color: "#1a1a2e" }}>
                          {fmt(Number(previewInvoice.total_amount), previewInvoice?.currency)}
                        </td>
                      </tr>
                      {Number(previewInvoice.amount_paid) > 0 && (
                        <tr>
                          <td style={{ padding: "4px 16px 4px 0", fontSize: "9pt", color: "#059669", fontWeight: 600 }}>Paid</td>
                          <td style={{ padding: "4px 0", textAlign: "right", fontFamily: "monospace", fontSize: "9pt", color: "#059669", fontWeight: 600 }}>
                            {fmt(Number(previewInvoice.amount_paid), previewInvoice?.currency)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* ── Notes ── */}
                {previewInvoice.notes && (
                  <div style={{ marginTop: "24px", paddingTop: "12px", borderTop: "1px solid #e5e7eb" }}>
                    <p style={{ fontSize: "8pt", fontWeight: 700, textTransform: "uppercase", color: "#888", letterSpacing: "1px", margin: "0 0 4px" }}>
                      Notes
                    </p>
                    <p style={{ fontSize: "9pt", color: "#555", margin: 0 }}>{previewInvoice.notes}</p>
                  </div>
                )}

                {/* ── Footer spacer + footer ── */}
                <div style={{ flexGrow: 1 }} />
                <div style={{ borderTop: "2px solid #1a1a2e", paddingTop: "10px", marginTop: "20px", textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: "8pt", color: "#888" }}>
                    {tenant?.name}{tenant?.tax_id ? ` • Tax ID: ${tenant.tax_id}` : ""}{tenant?.address ? ` • ${tenant.address}` : ""}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: "8pt", color: "#aaa" }}>
                    Thank you for your business
                  </p>
                </div>
              </div>

              <DialogFooter className="px-6 pb-6">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-1" /> Print
                </Button>
                <Button onClick={exportPdf}>Export PDF</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Invoices;
