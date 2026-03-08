import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search, Loader2, ChevronRight, ChevronDown, CornerDownRight, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type AccountType = Database["public"]["Enums"]["account_type"];

type Account = {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
  description: string | null;
  is_active: boolean;
  parent_id: string | null;
};

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

// Build a tree structure from flat accounts
function buildAccountTree(accounts: Account[]): AccountNode[] {
  const map = new Map<string, AccountNode>();
  const roots: AccountNode[] = [];

  accounts.forEach((a) => map.set(a.id, { ...a, children: [] }));

  accounts.forEach((a) => {
    if (a.parent_id && map.has(a.parent_id)) {
      map.get(a.parent_id)!.children.push(map.get(a.id)!);
    } else {
      roots.push(map.get(a.id)!);
    }
  });

  return roots;
}


// Flatten tree for rendering with depth info
type AccountNode = Account & { children: AccountNode[] };

function flattenTree(
  nodes: AccountNode[],
  depth = 0
): { account: Account; depth: number; hasChildren: boolean }[] {
  const result: { account: Account; depth: number; hasChildren: boolean }[] = [];
  for (const node of nodes) {
    result.push({ account: node, depth, hasChildren: node.children.length > 0 });
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

const ChartOfAccounts = () => {
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // Form state
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("expense");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);

  // Detail / Edit / Delete state
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chart-of-accounts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type, description, is_active, parent_id")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("code");
      return (data ?? []) as Account[];
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

  // Fetch journal lines for the selected account (ledger detail)
  const selectedAccount = selectedAccountId ? accounts.find((a) => a.id === selectedAccountId) : null;
  const { data: ledgerLines = [], isLoading: ledgerLoading } = useQuery({
    queryKey: ["account-ledger", tenantId, selectedAccountId],
    enabled: !!tenantId && !!selectedAccountId,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_lines")
        .select("id, debit, credit, description, journal_entry_id, created_at")
        .eq("tenant_id", tenantId!)
        .eq("account_id", selectedAccountId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  // Fetch journal entries for ledger lines
  const entryIds = useMemo(() => [...new Set(ledgerLines.map((l) => l.journal_entry_id))], [ledgerLines]);
  const { data: ledgerEntries = [] } = useQuery({
    queryKey: ["account-ledger-entries", entryIds],
    enabled: entryIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("id, entry_date, entry_number, description")
        .in("id", entryIds)
        .is("deleted_at", null);
      return data ?? [];
    },
  });

  const entriesMap = useMemo(() => {
    const m = new Map<string, { entry_date: string; entry_number: string; description: string }>();
    ledgerEntries.forEach((e) => m.set(e.id, e));
    return m;
  }, [ledgerEntries]);

  // Build ledger rows sorted by date with running balance
  const ledgerRows = useMemo(() => {
    if (!selectedAccount) return [];
    const isDebitNormal = selectedAccount.account_type === "asset" || selectedAccount.account_type === "expense";
    const sorted = [...ledgerLines].sort((a, b) => {
      const ea = entriesMap.get(a.journal_entry_id);
      const eb = entriesMap.get(b.journal_entry_id);
      const da = ea?.entry_date ?? a.created_at;
      const db = eb?.entry_date ?? b.created_at;
      return da.localeCompare(db);
    });
    let running = 0;
    return sorted.map((line) => {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      running += isDebitNormal ? debit - credit : credit - debit;
      const entry = entriesMap.get(line.journal_entry_id);
      return {
        id: line.id,
        date: entry?.entry_date ?? "",
        entryNumber: entry?.entry_number ?? "",
        description: line.description || entry?.description || "",
        debit,
        credit,
        runningBalance: running,
      };
    });
  }, [ledgerLines, entriesMap, selectedAccount]);

  // Compute own balance per account (from journal lines only)
  const ownBalances = useMemo(() => {
    return accountIds.reduce<Record<string, number>>((acc, id) => {
      const lines = lineTotals.filter((l) => l.account_id === id);
      const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
      const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
      const acct = accounts.find((a) => a.id === id);
      const isDebitNormal = acct?.account_type === "asset" || acct?.account_type === "expense";
      acc[id] = isDebitNormal ? totalDebit - totalCredit : totalCredit - totalDebit;
      return acc;
    }, {});
  }, [accountIds, lineTotals, accounts]);

  // Build tree and flatten
  const tree = useMemo(() => buildAccountTree(accounts), [accounts]);
  const flatList = useMemo(() => flattenTree(tree), [tree]);

  // Compute rolled-up balances (parent = sum of all descendants + own)
  const accountBalances = useMemo(() => {
    const rolled: Record<string, number> = {};
    function computeNodeBalance(node: AccountNode): number {
      const childSum = node.children.reduce((s, c) => s + computeNodeBalance(c), 0);
      const total = (ownBalances[node.id] ?? 0) + childSum;
      rolled[node.id] = total;
      return total;
    }
    tree.forEach(computeNodeBalance);
    // Also include leaf accounts not in tree (shouldn't happen but safety)
    accounts.forEach((a) => {
      if (!(a.id in rolled)) rolled[a.id] = ownBalances[a.id] ?? 0;
    });
    return rolled;
  }, [tree, ownBalances, accounts]);

  // Filter: when searching, show flat list; otherwise show tree
  const displayList = useMemo(() => {
    if (!search.trim()) {
      // Remove collapsed children
      const visible: typeof flatList = [];
      for (const item of flatList) {
        // Check if any ancestor is collapsed
        let isHidden = false;
        if (item.account.parent_id) {
          let pid: string | null = item.account.parent_id;
          while (pid) {
            if (collapsedIds.has(pid)) {
              isHidden = true;
              break;
            }
            const parent = accounts.find((a) => a.id === pid);
            pid = parent?.parent_id ?? null;
          }
        }
        if (!isHidden) visible.push(item);
      }
      return visible;
    }

    const lowerSearch = search.toLowerCase();
    return accounts
      .filter((a) => a.name.toLowerCase().includes(lowerSearch) || a.code.toLowerCase().includes(lowerSearch))
      .map((a) => ({ account: a, depth: 0, hasChildren: false }));
  }, [flatList, search, collapsedIds, accounts]);

  // All accounts can be parents (for nesting)
  const parentOptions = useMemo(
    () => accounts,
    [accounts]
  );

  // Check if account has children
  const hasChildAccounts = (id: string) => accounts.some((a) => a.parent_id === id);

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(n));

  const resetForm = () => {
    setCode("");
    setName("");
    setAccountType("expense");
    setDescription("");
    setParentId(null);
    setEditingAccount(null);
  };

  const openAddSubAccount = (parent: Account) => {
    resetForm();
    setParentId(parent.id);
    setAccountType(parent.account_type);
    setCode(parent.code + ".");
    setDialogOpen(true);
  };

  const openEditAccount = (acc: Account) => {
    setEditingAccount(acc);
    setCode(acc.code);
    setName(acc.name);
    setAccountType(acc.account_type);
    setDescription(acc.description ?? "");
    setParentId(acc.parent_id);
    setDialogOpen(true);
  };

  const handleDeleteClick = (acc: Account) => {
    const balance = accountBalances[acc.id] ?? 0;
    if (Math.abs(balance) > 0.001) {
      toast({ title: "Cannot delete", description: "Account has a non-zero balance.", variant: "destructive" });
      return;
    }
    if (hasChildAccounts(acc.id)) {
      toast({ title: "Cannot delete", description: "Account has sub-accounts. Delete them first.", variant: "destructive" });
      return;
    }
    setDeleteAccount(acc);
  };

  const confirmDelete = async () => {
    if (!deleteAccount || !tenantId) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("chart_of_accounts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", deleteAccount.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["chart-of-accounts", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["account-balances", tenantId] });
      toast({ title: "Account deleted", description: `${deleteAccount.code} – ${deleteAccount.name} removed.` });
      setDeleteAccount(null);
    } catch (err: any) {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
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

    const existing = accounts.find((a) => a.code === code.trim() && a.id !== editingAccount?.id);
    if (existing) {
      toast({ title: "Duplicate code", description: `Account code ${code} already exists.`, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editingAccount) {
        // Update
        const { error } = await supabase
          .from("chart_of_accounts")
          .update({
            code: code.trim(),
            name: name.trim(),
            account_type: accountType,
            description: description.trim() || null,
            parent_id: parentId,
          })
          .eq("id", editingAccount.id)
          .eq("tenant_id", tenantId);
        if (error) throw error;
        toast({ title: "Account updated", description: `${code} – ${name} saved.` });
      } else {
        // Insert
        const { error } = await supabase.from("chart_of_accounts").insert({
          tenant_id: tenantId,
          code: code.trim(),
          name: name.trim(),
          account_type: accountType,
          description: description.trim() || null,
          created_by: user.id,
          parent_id: parentId,
        });
        if (error) throw error;
        toast({ title: "Account created", description: `${code} – ${name} added successfully.` });
      }

      queryClient.invalidateQueries({ queryKey: ["chart-of-accounts", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["chart-of-accounts-active", tenantId] });
      resetForm();
      setDialogOpen(false);
    } catch (err: any) {
      console.error("Save account error:", err);
      toast({ title: "Failed to save account", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selectedParent = parentId ? accounts.find((a) => a.id === parentId) : null;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">Manage your account structure</p>
        </div>
        <Button variant="hero" size="sm" className="gap-2" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Account
        </Button>
      </div>

      {/* Add/Edit Account Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">
              {editingAccount ? "Edit Account" : parentId ? "Add Sub-Account" : "Add Account"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Parent Account Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Parent Account (optional)</Label>
              <Select
                value={parentId ?? "__none__"}
                onValueChange={(v) => {
                  if (v === "__none__") {
                    setParentId(null);
                  } else {
                    setParentId(v);
                    const parent = accounts.find((a) => a.id === v);
                    if (parent) {
                      setAccountType(parent.account_type);
                      if (!code || code.endsWith(".")) setCode(parent.code + ".");
                    }
                  }
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="None (top-level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (top-level)</SelectItem>
                  {parentOptions
                    .filter((a) => a.id !== editingAccount?.id) // Can't be own parent
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} – {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedParent && (
                <p className="text-xs text-muted-foreground">
                  Type inherited: <span className="font-medium capitalize">{selectedParent.account_type}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Account Code *</Label>
                <Input
                  placeholder={parentId && selectedParent ? `e.g. ${selectedParent.code}.01` : "e.g. 1000"}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={20}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Account Type *</Label>
                <Select
                  value={accountType}
                  onValueChange={(v) => setAccountType(v as AccountType)}
                  disabled={!!parentId}
                >
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
                placeholder="e.g. Electricity"
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
              <Button variant="outline" size="sm" onClick={() => { resetForm(); setDialogOpen(false); }} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingAccount ? "Save Changes" : parentId ? "Add Sub-Account" : "Add Account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteAccount} onOpenChange={(open) => { if (!open) setDeleteAccount(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteAccount?.code} – {deleteAccount?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transaction Ledger Sheet */}
      <Sheet open={!!selectedAccountId} onOpenChange={(open) => { if (!open) setSelectedAccountId(null); }}>
        <SheetContent className="sm:max-w-2xl w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-3">
              <span className="font-mono text-muted-foreground">{selectedAccount?.code}</span>
              <span>{selectedAccount?.name}</span>
              {selectedAccount && (
                <Badge variant="outline" className={`capitalize text-xs ${typeColors[selectedAccount.account_type] ?? ""}`}>
                  {selectedAccount.account_type}
                </Badge>
              )}
            </SheetTitle>
            {selectedAccount && (
              <p className={`text-lg font-semibold font-mono ${(accountBalances[selectedAccount.id] ?? 0) < 0 ? "text-destructive" : "text-foreground"}`}>
                {(accountBalances[selectedAccount.id] ?? 0) < 0
                  ? `(${fmt(accountBalances[selectedAccount.id] ?? 0)})`
                  : fmt(accountBalances[selectedAccount.id] ?? 0)}
              </p>
            )}
          </SheetHeader>

          <div className="mt-6">
            {ledgerLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : ledgerRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No transactions for this account.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Date</TableHead>
                    <TableHead className="w-24">Entry #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right w-24">Debit</TableHead>
                    <TableHead className="text-right w-24">Credit</TableHead>
                    <TableHead className="text-right w-28">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.date}</TableCell>
                      <TableCell className="font-mono text-xs">{row.entryNumber}</TableCell>
                      <TableCell className="text-sm truncate max-w-[200px]" title={row.description}>{row.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{row.debit > 0 ? fmt(row.debit) : ""}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{row.credit > 0 ? fmt(row.credit) : ""}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-medium ${row.runningBalance < 0 ? "text-destructive" : "text-foreground"}`}>
                        {row.runningBalance < 0 ? `(${fmt(row.runningBalance)})` : fmt(row.runningBalance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>

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
          ) : displayList.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search ? "No accounts match your search." : "No accounts yet. Add your first account to get started."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                     <th className="pb-3 text-left text-xs font-medium text-muted-foreground w-28">Code</th>
                     <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Account Name</th>
                     <th className="pb-3 text-left text-xs font-medium text-muted-foreground w-24">Type</th>
                     <th className="pb-3 text-left text-xs font-medium text-muted-foreground min-w-[200px]">Description</th>
                     <th className="pb-3 text-right text-xs font-medium text-muted-foreground w-32">Balance</th>
                     <th className="pb-3 text-right text-xs font-medium text-muted-foreground w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayList.map(({ account: acc, depth, hasChildren }) => {
                    const balance = accountBalances[acc.id] ?? 0;
                    const isCollapsed = collapsedIds.has(acc.id);
                    const isParent = hasChildren;
                    return (
                      <tr
                        key={acc.id}
                        className={`border-b border-border/50 transition-colors hover:bg-muted/50 group cursor-pointer ${isParent && depth === 0 ? "bg-muted/30" : ""}`}
                        onClick={() => setSelectedAccountId(acc.id)}
                      >
                        <td className="py-3 font-mono text-sm text-muted-foreground">
                          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 1.25}rem` }}>
                            {hasChildren && !search ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleCollapse(acc.id); }}
                                className="p-0.5 rounded hover:bg-muted"
                              >
                                {isCollapsed ? (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </button>
                            ) : depth > 0 ? (
                              <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                            ) : (
                              <span className="w-[1.125rem]" />
                            )}
                            <span className={isParent ? "font-semibold" : ""}>{acc.code}</span>
                          </div>
                        </td>
                        <td className={`py-3 text-sm text-foreground ${isParent ? "font-bold" : "font-medium"}`}>
                          <span style={{ paddingLeft: `${depth * 1.25}rem` }}>
                            {acc.name}
                          </span>
                        </td>
                         <td className="py-3">
                           <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${typeColors[acc.account_type] ?? ""}`}>
                             {acc.account_type}
                           </span>
                         </td>
                         <td className="py-3 text-xs text-muted-foreground max-w-[250px] truncate" title={acc.description ?? ""}>
                           {acc.description ?? "—"}
                         </td>
                         <td className={`py-3 text-right font-mono text-sm ${isParent ? "font-semibold" : ""} ${balance < 0 ? "text-destructive" : "text-foreground"}`}>
                          <div>{balance < 0 ? `(${fmt(balance)})` : fmt(balance)}</div>
                          {hasChildren && (ownBalances[acc.id] ?? 0) !== 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center justify-end gap-1 text-[11px] font-normal text-warning cursor-help">
                                    <AlertTriangle className="h-3 w-3" />
                                    <span>Own: {(ownBalances[acc.id] ?? 0) < 0 ? `(${fmt(ownBalances[acc.id] ?? 0)})` : fmt(ownBalances[acc.id] ?? 0)}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-[220px] text-xs">
                                  This parent account has direct entries. Consider reclassifying them to a sub-account for cleaner reporting.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              title="Edit account"
                              onClick={(e) => { e.stopPropagation(); openEditAccount(acc); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              title="Delete account"
                              onClick={(e) => { e.stopPropagation(); handleDeleteClick(acc); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              title="Add sub-account"
                              onClick={(e) => { e.stopPropagation(); openAddSubAccount(acc); }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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
