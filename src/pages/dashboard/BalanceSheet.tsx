import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { AsOfDateFilter } from "@/components/dashboard/DateRangeFilter";
import type { Database } from "@/integrations/supabase/types";

type AccountType = Database["public"]["Enums"]["account_type"];

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
  parent_id: string | null;
}

const DEBIT_NORMAL: AccountType[] = ["asset", "expense"];

const BalanceSheet = () => {
  const { tenantId, defaultCurrency } = useTenant();
  const [asOfDate, setAsOfDate] = useState<Date | undefined>(new Date());
  const fmt = (n: number) => formatCurrency(n, defaultCurrency, { abs: true });

  const asOfStr = asOfDate ? format(asOfDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ["bs-accounts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type, parent_id")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("code");
      return (data ?? []) as Account[];
    },
  });

  const { data: lineTotals = [], isLoading: loadingLines } = useQuery({
    queryKey: ["bs-line-totals", tenantId, asOfStr],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: entries } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("tenant_id", tenantId!)
        .eq("status", "posted")
        .is("deleted_at", null)
        .lte("entry_date", asOfStr);

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
      const isDebitNormal = DEBIT_NORMAL.includes(acc.account_type);
      const balance = lines.reduce((s, l) => {
        const d = Number(l.debit);
        const c = Number(l.credit);
        return s + (isDebitNormal ? d - c : c - d);
      }, 0);
      map[acc.id] = balance;
    }
    return map;
  }, [accounts, lineTotals]);

  const bsTypes: { type: AccountType; label: string; color: string }[] = [
    { type: "asset", label: "Assets", color: "text-blue-400" },
    { type: "liability", label: "Liabilities", color: "text-amber-400" },
    { type: "equity", label: "Equity", color: "text-emerald-400" },
  ];

  const buildTree = (type: AccountType) => {
    const typeAccounts = accounts.filter((a) => a.account_type === type);
    const roots = typeAccounts.filter(
      (a) => !a.parent_id || !typeAccounts.some((p) => p.id === a.parent_id)
    );
    const children = (parentId: string): Account[] =>
      typeAccounts.filter((a) => a.parent_id === parentId);

    const flatten = (
      nodes: Account[],
      depth: number
    ): { account: Account; depth: number; balance: number; hasChildren: boolean }[] => {
      const result: { account: Account; depth: number; balance: number; hasChildren: boolean }[] = [];
      for (const node of nodes) {
        const kids = children(node.id);
        const childBalance = kids.length > 0
          ? kids.reduce((s, k) => s + (ownBalances[k.id] ?? 0), 0) + (ownBalances[node.id] ?? 0)
          : ownBalances[node.id] ?? 0;
        result.push({
          account: node,
          depth,
          balance: kids.length > 0 ? childBalance : ownBalances[node.id] ?? 0,
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
    for (const { type } of bsTypes) {
      totals[type] = accounts
        .filter((a) => a.account_type === type)
        .reduce((s, a) => s + (ownBalances[a.id] ?? 0), 0);
    }
    return totals;
  }, [accounts, ownBalances]);

  const totalAssets = sectionTotals["asset"] ?? 0;
  const totalLiabilities = sectionTotals["liability"] ?? 0;
  const totalEquity = sectionTotals["equity"] ?? 0;

  const retainedEarnings = useMemo(() => {
    const revenue = accounts
      .filter((a) => a.account_type === "revenue")
      .reduce((s, a) => s + (ownBalances[a.id] ?? 0), 0);
    const expenses = accounts
      .filter((a) => a.account_type === "expense")
      .reduce((s, a) => s + (ownBalances[a.id] ?? 0), 0);
    return revenue - expenses;
  }, [accounts, ownBalances]);

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity + retainedEarnings;
  const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

  const displayDate = asOfDate
    ? asOfDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "Today";

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Balance Sheet</h1>
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
          <h1 className="text-2xl font-bold text-foreground">Balance Sheet</h1>
          <p className="text-sm text-muted-foreground">As of {displayDate} · Posted entries only</p>
        </div>
        <div className="flex items-center gap-3">
          <AsOfDateFilter date={asOfDate} onDateChange={setAsOfDate} />
          <Badge
            variant={isBalanced ? "default" : "destructive"}
            className={isBalanced ? "bg-success/10 text-success" : ""}
          >
            {isBalanced ? "Balanced ✓" : "Unbalanced ✗"}
          </Badge>
        </div>
      </div>

      <div className="max-w-3xl space-y-6">
        {bsTypes.map(({ type, label, color }) => {
          const rows = buildTree(type);
          const sectionTotal = sectionTotals[type] ?? 0;

          return (
            <Card key={type}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <h2 className={`text-lg font-bold ${color}`}>{label}</h2>
                  <span className={`font-mono text-lg font-bold ${color}`}>
                    {fmt(sectionTotal)}
                  </span>
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
                            ) : !hasChildren ? (
                              <span className="text-muted-foreground">{fmt(balance)}</span>
                            ) : (
                              <span className="text-foreground">{fmt(balance)}</span>
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

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                Net Income (Retained Earnings)
              </span>
              <span className={`font-mono text-sm font-semibold ${retainedEarnings >= 0 ? "text-success" : "text-destructive"}`}>
                {retainedEarnings >= 0 ? "" : "("}{fmt(retainedEarnings)}{retainedEarnings < 0 ? ")" : ""}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-accent/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Assets</span>
              <span className="font-mono font-semibold text-foreground">{fmt(totalAssets)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Liabilities + Equity + Retained Earnings</span>
              <span className="font-mono font-semibold text-foreground">{fmt(totalLiabilitiesAndEquity)}</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between text-sm">
              <span className="font-semibold text-foreground">Difference</span>
              <span className={`font-mono font-bold ${isBalanced ? "text-success" : "text-destructive"}`}>
                {fmt(totalAssets - totalLiabilitiesAndEquity)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BalanceSheet;
