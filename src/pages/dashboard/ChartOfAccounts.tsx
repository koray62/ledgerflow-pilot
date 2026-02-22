import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type AccountType = Database["public"]["Enums"]["account_type"];

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
];

const typeColors: Record<string, string> = {
  asset: "bg-info/10 text-info",
  liability: "bg-warning/10 text-warning",
  equity: "bg-accent/10 text-accent",
  revenue: "bg-success/10 text-success",
  expense: "bg-destructive/10 text-destructive",
};

const ChartOfAccounts = () => {
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("expense");
  const [description, setDescription] = useState("");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chart-of-accounts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type, description, is_active")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("code");
      return data ?? [];
    },
  });

  // Fetch journal line totals per account
  const accountIds = accounts.map((a) => a.id);
  const { data: lineTotals = [] } = useQuery({
    queryKey: ["account-balances", tenantId, accountIds],
    enabled: !!tenantId && accountIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("account_id", accountIds);
      return data ?? [];
    },
  });

  // Compute balance per account
  // Assets & Expenses: debit-normal (balance = debits - credits)
  // Liabilities, Equity, Revenue: credit-normal (balance = credits - debits)
  const accountBalances = accountIds.reduce<Record<string, number>>((acc, id) => {
    const lines = lineTotals.filter((l) => l.account_id === id);
    const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
    const acct = accounts.find((a) => a.id === id);
    const isDebitNormal = acct?.account_type === "asset" || acct?.account_type === "expense";
    acc[id] = isDebitNormal ? totalDebit - totalCredit : totalCredit - totalDebit;
    return acc;
  }, {});

  const filtered = accounts.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.code.toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(n));

  const resetForm = () => {
    setCode("");
    setName("");
    setAccountType("expense");
    setDescription("");
  };

  const handleSave = async () => {
    if (!tenantId || !user) return;
    if (!code.trim()) {
      toast({ title: "Code is required", variant: "destructive" });
      return;
    }
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    // Check for duplicate code
    const existing = accounts.find((a) => a.code === code.trim());
    if (existing) {
      toast({ title: "Duplicate code", description: `Account code ${code} already exists.`, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("chart_of_accounts").insert({
        tenant_id: tenantId,
        code: code.trim(),
        name: name.trim(),
        account_type: accountType,
        description: description.trim() || null,
        created_by: user.id,
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["chart-of-accounts", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["chart-of-accounts-active", tenantId] });
      toast({ title: "Account created", description: `${code} – ${name} added successfully.` });
      resetForm();
      setDialogOpen(false);
    } catch (err: any) {
      console.error("Create account error:", err);
      toast({ title: "Failed to create account", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">Manage your account structure</p>
        </div>
        <Button variant="hero" size="sm" className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> Add Account
        </Button>
      </div>

      {/* Add Account Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">Add Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Account Code *</Label>
                <Input
                  placeholder="e.g. 1000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={20}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Account Type *</Label>
                <Select value={accountType} onValueChange={(v) => setAccountType(v as AccountType)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Account Name *</Label>
              <Input
                placeholder="e.g. Cash"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea
                placeholder="Optional description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-none h-16"
                maxLength={300}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Add Account
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search accounts..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search ? "No accounts match your search." : "No accounts yet. Add your first account to get started."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Code</th>
                    <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Account Name</th>
                    <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="pb-3 text-right text-xs font-medium text-muted-foreground">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((acc) => {
                    const balance = accountBalances[acc.id] ?? 0;
                    return (
                      <tr key={acc.id} className="border-b border-border/50 transition-colors hover:bg-muted/50">
                        <td className="py-3 font-mono text-sm text-muted-foreground">{acc.code}</td>
                        <td className="py-3 text-sm font-medium text-foreground">{acc.name}</td>
                        <td className="py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${typeColors[acc.account_type] ?? ""}`}>
                            {acc.account_type}
                          </span>
                        </td>
                        <td className={`py-3 text-right font-mono text-sm ${balance < 0 ? "text-destructive" : "text-foreground"}`}>
                          {balance < 0 ? `(${fmt(balance)})` : fmt(balance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ChartOfAccounts;
