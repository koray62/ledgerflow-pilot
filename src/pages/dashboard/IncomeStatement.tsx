import { useState, useMemo } from "react";
import { format, startOfYear } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import type { Database } from "@/integrations/supabase/types";

type AccountType = Database["public"]["Enums"]["account_type"];

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
  parent_id: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(n));

const IncomeStatement = () => {
  const { tenantId } = useTenant();
  const [startDate, setStartDate] = useState<Date | undefined>(startOfYear(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());

  const startStr = startDate ? format(startDate, "yyyy-MM-dd") : undefined;
  const endStr = endDate ? format(endDate, "yyyy-MM-dd") : undefined;

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ["is-accounts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type, parent_id")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("account_type", ["revenue", "expense"])
        .order("code");
      return (data ?? []) as Account[];
    },
  });

  const { data: lineTotals = [], isLoading: loadingLines } = useQuery({
    queryKey: ["is-line-totals", tenantId, startStr, endStr],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase
        .from("journal_entries")
        .select("id")
        .eq("tenant_id", tenantId!)
        .eq("status", "posted")
        .is("deleted_at", null);

      if (startStr) query = query.gte("entry_date", startStr);
      if (endStr) query = query.lte("entry_date", endStr);

      const { data: entries } = await query;

      if (!entries || entries.length === 0) return [];

      const entryIds = entries.map((e) => e.id);
      const { data } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("journal_entry_id", entryIds);
      return data ?? [];
    },
  });

  const isLoading = loadingAccounts || loadingLines;

  const ownBalances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const acc of accounts) {
      const lines = lineTotals.filter((l) => l.account_id === acc.id);
      const isDebitNormal = acc.account_type === "expense";
      const balance = lines.reduce((s, l) => {
        const d = Number(l.debit);
        const c = Number(l.credit);
        return s + (isDebitNormal ? d - c : c - d);
      }, 0);
      map[acc.id] = balance;
    }
    return map;
  }, [accounts, lineTotals]);

  const sections: { type: AccountType; label: string; color: string }[] = [
    { type: "revenue", label: "Revenue", color: "text-emerald-400" },
    { type: "expense", label: "Expenses", color: "text-amber-400" },
  ];

  const buildTree = (type: AccountType) => {
    const typeAccounts = accounts.filter((a) => a.account_type === type);
    const roots = typeAccounts.filter(
      (a) => !a.parent_id || !typeAccounts.some((p) => p.id === a.parent_id)
    );
    const children = (parentId: string) =>
      typeAccounts.filter((a) => a.parent_id === parentId);

    const flatten = (
      nodes: Account[],
      depth: number
    ): { account: Account; depth: number; balance: number; hasChildren: boolean }[] => {
      const result: { account: Account; depth: number; balance: number; hasChildren: boolean }[] = [];
      for (const node of nodes) {
        const kids = children(node.id);
        const childBalance =
          kids.length > 0
            ? kids.reduce((s, k) => s + (ownBalances[k.id] ?? 0), 0) + (ownBalances[node.id] ?? 0)
            : ownBalances[node.id] ?? 0;
        result.push({
          account: node,
          depth,
          balance: childBalance,
          hasChildren: kids.length > 0,
        });
        if (kids.length > 0) {
          result.push(...flatten(kids, depth + 1));
        }
      }
      return result;
    };

    return flatten(roots, 0);
  };

  const sectionTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const { type } of sections) {
      totals[type] = accounts
        .filter((a) => a.account_type === type)
        .reduce((s, a) => s + (ownBalances[a.id] ?? 0), 0);
    }
    return totals;
  }, [accounts, ownBalances]);

  const totalRevenue = sectionTotals["revenue"] ?? 0;
  const totalExpenses = sectionTotals["expense"] ?? 0;
  const netIncome = totalRevenue - totalExpenses;

  const subtitle = [
    startDate && format(startDate, "MMM d, yyyy"),
    endDate && format(endDate, "MMM d, yyyy"),
  ]
    .filter(Boolean)
    .join(" – ") || "All time";

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Income Statement</h1>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Income Statement</h1>
          <p className="text-sm text-muted-foreground">{subtitle} · Posted entries only</p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          <Badge
            variant="default"
            className={netIncome >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}
          >
            {netIncome >= 0 ? "Net Profit" : "Net Loss"}
          </Badge>
        </div>
      </div>

      <div className="max-w-3xl space-y-6">
        {sections.map(({ type, label, color }) => {
          const rows = buildTree(type);
          const sectionTotal = sectionTotals[type] ?? 0;

          return (
            <Card key={type}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <h2 className={`text-lg font-bold ${color}`}>{label}</h2>
                  <span className={`font-mono text-lg font-bold ${color}`}>{fmt(sectionTotal)}</span>
                </div>
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No {label.toLowerCase()} accounts found.
                  </p>
                ) : (
                  <table className="w-full">
                    <tbody>
                      {rows.map(({ account, depth, balance, hasChildren }) => (
                        <tr
                          key={account.id}
                          className={`border-b border-border/30 ${hasChildren && depth === 0 ? "bg-muted/30" : ""}`}
                        >
                          <td className="py-2.5 text-sm" style={{ paddingLeft: `${depth * 24 + 8}px` }}>
                            <span className="font-mono text-xs text-muted-foreground mr-2">
                              {account.code}
                            </span>
                            <span className={hasChildren ? "font-semibold text-foreground" : "text-foreground"}>
                              {account.name}
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-mono text-sm pr-2">
                            {hasChildren && depth === 0 ? (
                              <span className="font-semibold text-foreground">{fmt(balance)}</span>
                            ) : (
                              <span className="text-muted-foreground">{fmt(balance)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Card className="border-accent/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Revenue</span>
              <span className="font-mono font-semibold text-foreground">{fmt(totalRevenue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Expenses</span>
              <span className="font-mono font-semibold text-foreground">{fmt(totalExpenses)}</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between text-sm">
              <span className="font-semibold text-foreground">Net Income</span>
              <span className={`font-mono font-bold ${netIncome >= 0 ? "text-success" : "text-destructive"}`}>
                {netIncome < 0 && "("}{fmt(netIncome)}{netIncome < 0 && ")"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IncomeStatement;
