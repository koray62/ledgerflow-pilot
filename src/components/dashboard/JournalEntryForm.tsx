import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Trash2, Loader2, AlertCircle, RefreshCw, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { cn, formatCurrency, formatDisplayDate, SUPPORTED_CURRENCIES } from "@/lib/utils";
import { useClosedFiscalYears } from "@/hooks/useClosedFiscalYears";

interface JournalLine {
  id?: string;
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

const emptyLine = (): JournalLine => ({
  accountId: "",
  debit: "",
  credit: "",
  description: "",
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editEntryId?: string | null;
}

const JournalEntryForm = ({ open, onOpenChange, editEntryId }: Props) => {
  const { tenantId, defaultCurrency } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isDateInClosedYear } = useClosedFiscalYears();

  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [memo, setMemo] = useState("");
  const [contactType, setContactType] = useState<"none" | "vendor" | "customer">("none");
  const [contactId, setContactId] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState("monthly");
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [loadingEntry, setLoadingEntry] = useState(false);

  const isEditMode = !!editEntryId;

  // Fetch accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts-active", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("code");
      return data ?? [];
    },
  });

  // Fetch vendors
  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-list", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendors")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-list", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  // Load existing entry when editing
  useEffect(() => {
    if (!open || !editEntryId || !tenantId) return;

    const loadEntry = async () => {
      setLoadingEntry(true);
      try {
        const [entryRes, linesRes] = await Promise.all([
          supabase
            .from("journal_entries")
            .select("entry_date, description, memo, status, currency")
            .eq("id", editEntryId)
            .eq("tenant_id", tenantId)
            .single(),
          supabase
            .from("journal_lines")
            .select("id, account_id, debit, credit, description")
            .eq("journal_entry_id", editEntryId)
            .eq("tenant_id", tenantId)
            .is("deleted_at", null),
        ]);

        if (entryRes.data) {
          setEntryDate(entryRes.data.entry_date);
          setDescription(entryRes.data.description);
          setMemo(entryRes.data.memo || "");
          setCurrency((entryRes.data as any).currency || defaultCurrency);
        }

        if (linesRes.data && linesRes.data.length > 0) {
          setLines(
            linesRes.data.map((l) => ({
              id: l.id,
              accountId: l.account_id,
              debit: Number(l.debit) > 0 ? String(l.debit) : "",
              credit: Number(l.credit) > 0 ? String(l.credit) : "",
              description: l.description || "",
            }))
          );
        } else {
          setLines([emptyLine(), emptyLine()]);
        }
      } catch (err) {
        console.error("Failed to load entry:", err);
        toast({ title: "Failed to load entry", variant: "destructive" });
      } finally {
        setLoadingEntry(false);
      }
    };

    loadEntry();
  }, [open, editEntryId, tenantId]);

  // Reset form when opening for new entry
  useEffect(() => {
    if (open && !editEntryId) {
      setDescription("");
      setMemo("");
      setContactType("none");
      setContactId("");
      setIsRecurring(false);
      setRecurrenceInterval("monthly");
      setCurrency(defaultCurrency);
      setEntryDate(new Date().toISOString().split("T")[0]);
      setLines([emptyLine(), emptyLine()]);
      setErrors([]);
    }
  }, [open, editEntryId]);

  const updateLine = (idx: number, field: keyof JournalLine, value: string) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === "debit" && value) updated.credit = "";
      if (field === "credit" && value) updated.debit = "";
      return updated;
    }));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.005;

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!description.trim()) errs.push("Description is required.");
    if (!entryDate) errs.push("Date is required.");
    if (entryDate && isDateInClosedYear(entryDate)) errs.push("Cannot create entries in a closed fiscal year.");
    if (description.trim().length > 200) errs.push("Description must be under 200 characters.");

    const validLines = lines.filter((l) => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));
    if (validLines.length < 2) errs.push("At least two lines with amounts are required.");

    lines.forEach((l, i) => {
      if (l.accountId && !parseFloat(l.debit) && !parseFloat(l.credit)) {
        errs.push(`Line ${i + 1}: Enter a debit or credit amount.`);
      }
      if ((parseFloat(l.debit) || 0) < 0 || (parseFloat(l.credit) || 0) < 0) {
        errs.push(`Line ${i + 1}: Amounts must be positive.`);
      }
    });

    if (!isBalanced) errs.push(`Debits ($${totalDebit.toFixed(2)}) must equal Credits ($${totalCredit.toFixed(2)}).`);
    return errs;
  };

  const handleSave = useCallback(async () => {
    const validationErrors = validate();
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;
    if (!tenantId || !user) return;

    setSaving(true);
    try {
      if (isEditMode && editEntryId) {
        // Update existing entry
        const { error: updateErr } = await supabase
          .from("journal_entries")
          .update({
            entry_date: entryDate,
            description: description.trim(),
            memo: memo.trim() || null,
            currency,
          } as any)
          .eq("id", editEntryId)
          .eq("tenant_id", tenantId);

        if (updateErr) throw updateErr;

        // Delete old lines and re-insert
        const { error: delErr } = await supabase
          .from("journal_lines")
          .delete()
          .eq("journal_entry_id", editEntryId)
          .eq("tenant_id", tenantId);

        if (delErr) throw delErr;

        const lineRows = lines
          .filter((l) => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
          .map((l) => ({
            tenant_id: tenantId,
            journal_entry_id: editEntryId,
            account_id: l.accountId,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
            description: l.description.trim() || null,
          }));

        const { error: linesErr } = await supabase
          .from("journal_lines")
          .insert(lineRows);

        if (linesErr) throw linesErr;

        queryClient.invalidateQueries({ queryKey: ["journal-entries", tenantId] });
        queryClient.invalidateQueries({ queryKey: ["journal-line-totals", tenantId] });

        toast({ title: "Entry updated", description: "Journal entry has been updated." });
        onOpenChange(false);
      } else {
        // Create new entry
        const entryNumber = `JE-${Date.now().toString(36).toUpperCase()}`;

        const { data: je, error: jeErr } = await supabase
          .from("journal_entries")
          .insert({
            tenant_id: tenantId,
            entry_number: entryNumber,
            entry_date: entryDate,
            description: description.trim(),
            memo: memo.trim() || null,
            currency,
            status: "draft",
            created_by: user.id,
          } as any)
          .select("id")
          .single();

        if (jeErr || !je) throw jeErr || new Error("Failed to create entry");

        const lineRows = lines
          .filter((l) => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
          .map((l) => ({
            tenant_id: tenantId,
            journal_entry_id: je.id,
            account_id: l.accountId,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
            description: l.description.trim() || null,
          }));

        const { error: linesErr } = await supabase
          .from("journal_lines")
          .insert(lineRows);

        if (linesErr) throw linesErr;

        // Create forecast entry if recurring
        if (isRecurring) {
          const totalDebit = lineRows.reduce((s, l) => s + Number(l.debit || 0), 0);
          const totalCredit = lineRows.reduce((s, l) => s + Number(l.credit || 0), 0);
          const forecastAmount = totalDebit >= totalCredit ? totalDebit : totalCredit;
          const forecastCategory = totalDebit >= totalCredit ? "expense" : "revenue";

          await supabase.from("forecast_entries").insert({
            tenant_id: tenantId,
            forecast_date: entryDate,
            description: description.trim(),
            amount: forecastAmount,
            category: forecastCategory,
            is_recurring: true,
            recurrence_interval: recurrenceInterval,
            created_by: user.id,
          });

          queryClient.invalidateQueries({ queryKey: ["forecast-entries", tenantId] });
        }

        queryClient.invalidateQueries({ queryKey: ["journal-entries", tenantId] });
        queryClient.invalidateQueries({ queryKey: ["journal-line-totals", tenantId] });

        const recurLabel = isRecurring ? ` (recurring ${recurrenceInterval})` : "";
        toast({ title: "Entry created", description: `Journal entry ${entryNumber} saved as draft${recurLabel}.` });

        // Reset form
        setDescription("");
        setMemo("");
        setIsRecurring(false);
        setRecurrenceInterval("monthly");
        setEntryDate(new Date().toISOString().split("T")[0]);
        setLines([emptyLine(), emptyLine()]);
        setErrors([]);
        onOpenChange(false);
      }
    } catch (err: any) {
      console.error("Save JE error:", err);
      toast({ title: "Save failed", description: err.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [tenantId, user, entryDate, description, memo, isRecurring, recurrenceInterval, lines, queryClient, onOpenChange, isEditMode, editEntryId]);

  const fmt = (n: number) => formatCurrency(n, defaultCurrency);

  // Group accounts by type
  const accountsByType = accounts.reduce<Record<string, typeof accounts>>((acc, a) => {
    const key = a.account_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground">
            {isEditMode ? "Edit Journal Entry" : "New Journal Entry"}
          </DialogTitle>
        </DialogHeader>

        {loadingEntry ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-9 w-full justify-start text-left text-sm font-normal",
                        !entryDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {entryDate
                        ? formatDisplayDate(entryDate, currency)
                        : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={entryDate ? new Date(entryDate + "T00:00:00") : undefined}
                      onSelect={(date) => {
                        if (date) {
                          const yyyy = date.getFullYear();
                          const mm = String(date.getMonth() + 1).padStart(2, "0");
                          const dd = String(date.getDate()).padStart(2, "0");
                          setEntryDate(`${yyyy}-${mm}-${dd}`);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="je-desc" className="text-xs text-muted-foreground">Description *</Label>
                <Input
                  id="je-desc"
                  placeholder="e.g. Office rent payment"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Vendor / Customer selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Contact Type</Label>
                <Select value={contactType} onValueChange={(v: "none" | "vendor" | "customer") => { setContactType(v); setContactId(""); }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {contactType !== "none" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {contactType === "vendor" ? "Vendor" : "Customer"}
                  </Label>
                  <Select value={contactId} onValueChange={setContactId}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={`Select ${contactType}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {(contactType === "vendor" ? vendors : customers).map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
                      ))}
                      {(contactType === "vendor" ? vendors : customers).length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No {contactType}s found</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="je-memo" className="text-xs text-muted-foreground">Memo</Label>
              <Textarea
                id="je-memo"
                placeholder="Optional notes..."
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="resize-none h-16"
                maxLength={500}
              />
            </div>

            {/* Recurring toggle - only for new entries */}
            {!isEditMode && (
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Recurring Entry</p>
                      <p className="text-xs text-muted-foreground">Automatically schedule this as a repeating forecast</p>
                    </div>
                  </div>
                  <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
                </div>
                {isRecurring && (
                  <div className="space-y-1.5 pl-6">
                    <Label className="text-xs text-muted-foreground">Frequency</Label>
                    <Select value={recurrenceInterval} onValueChange={setRecurrenceInterval}>
                      <SelectTrigger className="h-8 text-xs w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                        <SelectItem value="biweekly" className="text-xs">Biweekly</SelectItem>
                        <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                        <SelectItem value="quarterly" className="text-xs">Quarterly</SelectItem>
                        <SelectItem value="annual" className="text-xs">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">Journal Lines</p>
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5" /> Add Line
                </Button>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[40%]">Account</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-24">Debit</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-24">Credit</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={idx} className="border-b border-border/50">
                        <td className="px-2 py-1.5">
                          <Select value={line.accountId} onValueChange={(v) => updateLine(idx, "accountId", v)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(accountsByType).map(([type, accts]) => (
                                <div key={type}>
                                  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{type}</div>
                                  {accts.map((a) => (
                                    <SelectItem key={a.id} value={a.id} className="text-xs">
                                      {a.code} – {a.name}
                                    </SelectItem>
                                  ))}
                                </div>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 text-xs"
                            placeholder="Line description"
                            value={line.description}
                            onChange={(e) => updateLine(idx, "description", e.target.value)}
                            maxLength={200}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 text-xs text-right font-mono"
                            placeholder="0.00"
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.debit}
                            onChange={(e) => updateLine(idx, "debit", e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 text-xs text-right font-mono"
                            placeholder="0.00"
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.credit}
                            onChange={(e) => updateLine(idx, "credit", e.target.value)}
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeLine(idx)}
                            disabled={lines.length <= 2}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30">
                      <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Totals</td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-semibold text-foreground">{fmt(totalDebit)}</td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-semibold text-foreground">{fmt(totalCredit)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Balance indicator */}
              <div className="mt-2 flex items-center justify-end gap-2 text-xs">
                <span className={`font-mono font-medium ${isBalanced ? "text-success" : totalDebit > 0 || totalCredit > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  Difference: {fmt(Math.abs(totalDebit - totalCredit))}
                </span>
                {isBalanced && <span className="text-success">✓ Balanced</span>}
              </div>
            </div>

            {/* Validation errors */}
            {errors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                {errors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isEditMode ? "Save Changes" : "Save as Draft"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default JournalEntryForm;
