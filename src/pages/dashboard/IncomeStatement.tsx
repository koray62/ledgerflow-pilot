import { useState, useMemo, useCallback } from "react";
import { format, startOfYear, subYears } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/hooks/useTenant";
import { formatCurrency } from "@/lib/utils";
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

const pctChange = (current: number, previous: number): string | null => {
  if (previous === 0) return current === 0 ? null : "+∞";
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
};

const PctBadge = ({ current, previous }: { current: number; previous: number }) => {
  const pct = pctChange(current, previous);
  if (!pct) return null;
  const isPositive = pct.startsWith("+");
  return (
    <div className={`text-[10px] leading-tight ${isPositive ? "text-success" : "text-destructive"}`}>
      {pct}
    </div>
  );
};

// Accrual mode: standard fetch of posted journal entry line totals
const fetchAccrualLineTotals = async (
  tenantId: string,
  startStr?: string,
  endStr?: string
) => {
  let query = supabase
    .from("journal_entries")
    .select("id")
    .eq("tenant_id", tenantId)
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
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("journal_entry_id", entryIds);
  return data ?? [];
};

// Cash mode: only consider journal entries that touch cash accounts (1010/1000 descendants),
// then attribute amounts to the counter-party revenue/expense accounts
const fetchCashLineTotals = async (
  tenantId: string,
  cashAccountIds: string[],
  excludeAccountIds: string[],
  startStr?: string,
  endStr?: string
) => {
  if (cashAccountIds.length === 0) return [];

  // Get posted entries in date range
  let query = supabase
    .from("journal_entries")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "posted")
    .is("deleted_at", null);

  if (startStr) query = query.gte("entry_date", startStr);
  if (endStr) query = query.lte("entry_date", endStr);

  const { data: entries } = await query;
  if (!entries || entries.length === 0) return [];

  const entryIds = entries.map((e) => e.id);

  // Get ALL journal lines for those entries
  const { data: allLines } = await supabase
    .from("journal_lines")
    .select("account_id, debit, credit, journal_entry_id")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("journal_entry_id", entryIds);

  if (!allLines || allLines.length === 0) return [];

  const cashIdSet = new Set(cashAccountIds);
  const excludeSet = new Set(excludeAccountIds);

  // Group lines by journal_entry_id
  const linesByEntry = new Map<string, typeof allLines>();
  for (const line of allLines) {
    const existing = linesByEntry.get(line.journal_entry_id) ?? [];
    existing.push(line);
    linesByEntry.set(line.journal_entry_id, existing);
  }

  // For each entry that has at least one cash line, attribute the cash amount
  // to the counter-party (non-cash, non-excluded) accounts
  const syntheticTotals: { account_id: string; debit: number; credit: number }[] = [];

  for (const [, entryLines] of linesByEntry) {
    const hasCashLine = entryLines.some((l) => cashIdSet.has(l.account_id));
    if (!hasCashLine) continue;

    // Get counter-party lines (non-cash, non-excluded like AR/Deferred Revenue)
    const counterLines = entryLines.filter(
      (l) => !cashIdSet.has(l.account_id) && !excludeSet.has(l.account_id)
    );

    for (const cl of counterLines) {
      syntheticTotals.push({
        account_id: cl.account_id,
        debit: Number(cl.debit),
        credit: Number(cl.credit),
      });
    }
  }

  return syntheticTotals;
};

const computeBalances = (
  accounts: Account[],
  lineTotals: { account_id: string; debit: number; credit: number }[]
) => {
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
};

// Codes to exclude from Cash Basis P&L display
const CASH_EXCLUDED_CODES = ["1100", "2200"];

const IncomeStatement = () => {
  const { tenantId, defaultCurrency, accountingBasis } = useTenant();
  const isCashBasis = accountingBasis === "cash";
  const fmt = (n: number) => formatCurrency(n, defaultCurrency, { abs: true });
  const [startDate, setStartDate] = useState<Date | undefined>(startOfYear(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [compareEnabled, setCompareEnabled] = useState(false);

  const startStr = startDate ? format(startDate, "yyyy-MM-dd") : undefined;
  const endStr = endDate ? format(endDate, "yyyy-MM-dd") : undefined;

  // Fetch all accounts (not just revenue/expense) so we can identify cash & excluded accounts
  const { data: allAccounts = [], isLoading: loadingAllAccounts } = useQuery({
    queryKey: ["is-all-accounts", tenantId],
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

  const accounts = useMemo(
    () => allAccounts.filter((a) => a.account_type === "revenue" || a.account_type === "expense"),
    [allAccounts]
  );

  // In cash mode, filter out AR (1100) and Deferred Revenue (2200) accounts from display
  const displayAccounts = useMemo(() => {
    if (!isCashBasis) return accounts;
    return accounts.filter((a) => !CASH_EXCLUDED_CODES.includes(a.code));
  }, [accounts, isCashBasis]);

  // Derive cash account IDs (code 1000 and all descendants)
  const cashAccountIds = useMemo(() => {
    const parent = allAccounts.find((a) => a.code === "1000" && a.account_type === "asset");
    if (!parent) {
      // Try 1010 directly
      const direct = allAccounts.find((a) => a.code === "1010" && a.account_type === "asset");
      return direct ? [direct.id] : [];
    }
    const childIds = new Set(allAccounts.filter((a) => a.parent_id === parent.id).map((a) => a.id));
    return allAccounts
      .filter((a) => a.id === parent.id || a.parent_id === parent.id || childIds.has(a.parent_id ?? ""))
      .map((a) => a.id);
  }, [allAccounts]);

  // Excluded account IDs for cash mode (AR=1100, Deferred Revenue=2200)
  const excludeAccountIds = useMemo(
    () => allAccounts.filter((a) => CASH_EXCLUDED_CODES.includes(a.code)).map((a) => a.id),
    [allAccounts]
  );

  const fetchLineTotals = useCallback(
    (tId: string, s?: string, e?: string) => {
      if (isCashBasis) {
        return fetchCashLineTotals(tId, cashAccountIds, excludeAccountIds, s, e);
      }
      return fetchAccrualLineTotals(tId, s, e);
    },
    [isCashBasis, cashAccountIds, excludeAccountIds]
  );

  const { data: lineTotals = [], isLoading: loadingLines } = useQuery({
    queryKey: ["is-line-totals", tenantId, startStr, endStr, accountingBasis, cashAccountIds],
    enabled: !!tenantId && !loadingAllAccounts,
    queryFn: () => fetchLineTotals(tenantId!, startStr, endStr),
  });

  // Comparison year queries
  const compYears = [1, 2, 3];
  const compDates = compYears.map((offset) => ({
    start: startDate ? format(subYears(startDate, offset), "yyyy-MM-dd") : undefined,
    end: endDate ? format(subYears(endDate, offset), "yyyy-MM-dd") : undefined,
  }));

  const { data: compLines1 = [] } = useQuery({
    queryKey: ["is-line-totals", tenantId, compDates[0].start, compDates[0].end, accountingBasis, cashAccountIds],
    enabled: compareEnabled && !!tenantId && !loadingAllAccounts,
    queryFn: () => fetchLineTotals(tenantId!, compDates[0].start, compDates[0].end),
  });
  const { data: compLines2 = [] } = useQuery({
    queryKey: ["is-line-totals", tenantId, compDates[1].start, compDates[1].end, accountingBasis, cashAccountIds],
    enabled: compareEnabled && !!tenantId && !loadingAllAccounts,
    queryFn: () => fetchLineTotals(tenantId!, compDates[1].start, compDates[1].end),
  });
  const { data: compLines3 = [] } = useQuery({
    queryKey: ["is-line-totals", tenantId, compDates[2].start, compDates[2].end, accountingBasis, cashAccountIds],
    enabled: compareEnabled && !!tenantId && !loadingAllAccounts,
    queryFn: () => fetchLineTotals(tenantId!, compDates[2].start, compDates[2].end),
  });

  const isLoading = loadingAllAccounts || loadingLines;

  const ownBalances = useMemo(() => computeBalances(displayAccounts, lineTotals), [displayAccounts, lineTotals]);

  const compBalances = useMemo(() => {
    if (!compareEnabled) return [];
    return [compLines1, compLines2, compLines3].map((lines) =>
      computeBalances(displayAccounts, lines)
    );
  }, [compareEnabled, displayAccounts, compLines1, compLines2, compLines3]);

  const sections: { type: AccountType; label: string; color: string }[] = [
    { type: "revenue", label: "Revenue", color: "text-emerald-400" },
    { type: "expense", label: "Expenses", color: "text-amber-400" },
  ];

  const buildTree = (type: AccountType) => {
    const typeAccounts = displayAccounts.filter((a) => a.account_type === type);
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

  const getBalanceForAccount = (balMap: Record<string, number>, accountId: string, type: AccountType) => {
    const typeAccounts = displayAccounts.filter((a) => a.account_type === type);
    const kids = typeAccounts.filter((a) => a.parent_id === accountId);
    if (kids.length > 0) {
      return kids.reduce((s, k) => s + (balMap[k.id] ?? 0), 0) + (balMap[accountId] ?? 0);
    }
    return balMap[accountId] ?? 0;
  };

  const getSectionTotal = (balMap: Record<string, number>, type: AccountType) =>
    displayAccounts.filter((a) => a.account_type === type).reduce((s, a) => s + (balMap[a.id] ?? 0), 0);

  const sectionTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const { type } of sections) {
      totals[type] = getSectionTotal(ownBalances, type);
    }
    return totals;
  }, [displayAccounts, ownBalances]);

  const totalRevenue = sectionTotals["revenue"] ?? 0;
  const totalExpenses = sectionTotals["expense"] ?? 0;
  const netIncome = totalRevenue - totalExpenses;

  // Year labels for comparison columns
  const currentYear = startDate ? startDate.getFullYear() : new Date().getFullYear();
  const yearLabels = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

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
          <Badge variant="outline" className="text-xs">
            {isCashBasis ? "Cash Basis" : "Accrual Basis"}
          </Badge>
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => {
              setStartDate(startOfYear(new Date()));
              setEndDate(new Date());
              setCompareEnabled(false);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
          <div className="flex items-center gap-1.5">
            <Switch
              id="compare-toggle"
              checked={compareEnabled}
              onCheckedChange={(checked) => {
                setCompareEnabled(checked);
                if (checked) {
                  const yr = new Date().getFullYear();
                  setStartDate(new Date(yr, 0, 1));
                  setEndDate(new Date(yr, 11, 31));
                }
              }}
            />
            <Label htmlFor="compare-toggle" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
              Compare
            </Label>
          </div>
          {compareEnabled && (() => {
            const yr = new Date().getFullYear();
            const isFullYear = startDate?.getFullYear() === yr && startDate?.getMonth() === 0 && startDate?.getDate() === 1
              && endDate?.getFullYear() === yr && endDate?.getMonth() === 11 && endDate?.getDate() === 31;
            return (
              <Button
                variant={isFullYear ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => {
                  setStartDate(new Date(yr, 0, 1));
                  setEndDate(new Date(yr, 11, 31));
                }}
              >
                Full Year
              </Button>
            );
          })()}
          <Badge
            variant="default"
            className={netIncome >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}
          >
            {netIncome >= 0 ? "Net Profit" : "Net Loss"}
          </Badge>
        </div>
      </div>

      <div className={`${compareEnabled ? "max-w-5xl" : "max-w-3xl"} space-y-6 transition-all`}>
        {sections.map(({ type, label, color }) => {
          const rows = buildTree(type);
          const sectionTotal = sectionTotals[type] ?? 0;

          return (
            <Card key={type}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <h2 className={`text-lg font-bold ${color}`}>{label}</h2>
                </div>
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No {label.toLowerCase()} accounts found.
                  </p>
                ) : (
                  <table className="w-full">
                    {compareEnabled && (
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="py-2 text-left text-xs font-medium text-muted-foreground">Account</th>
                          {yearLabels.map((y) => (
                            <th key={y} className="py-2 text-right text-xs font-medium text-muted-foreground pr-2">
                              {y}
                            </th>
                          ))}
                        </tr>
                      </thead>
                    )}
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
                            {compareEnabled && compBalances.length > 0 && (
                              <PctBadge current={balance} previous={getBalanceForAccount(compBalances[0], account.id, account.account_type)} />
                            )}
                          </td>
                          {compareEnabled &&
                            compBalances.map((cb, i) => {
                              const val = getBalanceForAccount(cb, account.id, account.account_type);
                              return (
                                <td key={i} className="py-2.5 text-right font-mono text-sm pr-2">
                                  <span className="text-muted-foreground">{fmt(val)}</span>
                                  {i < compBalances.length - 1 && (
                                    <PctBadge current={val} previous={getBalanceForAccount(compBalances[i + 1], account.id, account.account_type)} />
                                  )}
                                </td>
                              );
                            })}
                        </tr>
                      ))}
                      {/* Section total row */}
                      <tr className="border-t border-border bg-muted/40">
                        <td className="py-2.5 text-sm font-semibold text-foreground pl-2">
                          Total {label}
                        </td>
                        <td className={`py-2.5 text-right font-mono text-sm font-bold pr-2 ${color}`}>
                          {fmt(sectionTotal)}
                          {compareEnabled && compBalances.length > 0 && (
                            <PctBadge current={sectionTotal} previous={getSectionTotal(compBalances[0], type)} />
                          )}
                        </td>
                        {compareEnabled &&
                          compBalances.map((cb, i) => {
                            const val = getSectionTotal(cb, type);
                            return (
                              <td key={i} className="py-2.5 text-right font-mono text-sm font-semibold text-muted-foreground pr-2">
                                {fmt(val)}
                                {i < compBalances.length - 1 && (
                                  <PctBadge current={val} previous={getSectionTotal(compBalances[i + 1], type)} />
                                )}
                              </td>
                            );
                          })}
                      </tr>
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Card className="border-accent/30">
          <CardContent className="p-4 space-y-2">
            {compareEnabled ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="py-2 text-left text-xs font-medium text-muted-foreground"></th>
                    {yearLabels.map((y) => (
                      <th key={y} className="py-2 text-right text-xs font-medium text-muted-foreground pr-2">
                        {y}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/30">
                    <td className="py-2 text-sm text-muted-foreground">Total Revenue</td>
                    <td className="py-2 text-right font-mono text-sm font-semibold text-foreground pr-2">
                      {fmt(totalRevenue)}
                      {compBalances.length > 0 && <PctBadge current={totalRevenue} previous={getSectionTotal(compBalances[0], "revenue")} />}
                    </td>
                    {compBalances.map((cb, i) => {
                      const val = getSectionTotal(cb, "revenue");
                      return (
                        <td key={i} className="py-2 text-right font-mono text-sm text-muted-foreground pr-2">
                          {fmt(val)}
                          {i < compBalances.length - 1 && (
                            <PctBadge current={val} previous={getSectionTotal(compBalances[i + 1], "revenue")} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b border-border/30">
                    <td className="py-2 text-sm text-muted-foreground">Total Expenses</td>
                    <td className="py-2 text-right font-mono text-sm font-semibold text-foreground pr-2">
                      {fmt(totalExpenses)}
                      {compBalances.length > 0 && <PctBadge current={totalExpenses} previous={getSectionTotal(compBalances[0], "expense")} />}
                    </td>
                    {compBalances.map((cb, i) => {
                      const val = getSectionTotal(cb, "expense");
                      return (
                        <td key={i} className="py-2 text-right font-mono text-sm text-muted-foreground pr-2">
                          {fmt(val)}
                          {i < compBalances.length - 1 && (
                            <PctBadge current={val} previous={getSectionTotal(compBalances[i + 1], "expense")} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-t border-border">
                    <td className="py-2 text-sm font-semibold text-foreground">Net Income</td>
                    <td className={`py-2 text-right font-mono text-sm font-bold pr-2 ${netIncome >= 0 ? "text-success" : "text-destructive"}`}>
                      {netIncome < 0 && "("}{fmt(netIncome)}{netIncome < 0 && ")"}
                      {compBalances.length > 0 && (() => {
                        const prevNet = getSectionTotal(compBalances[0], "revenue") - getSectionTotal(compBalances[0], "expense");
                        return <PctBadge current={netIncome} previous={prevNet} />;
                      })()}
                    </td>
                    {compBalances.map((cb, i) => {
                      const rev = getSectionTotal(cb, "revenue");
                      const exp = getSectionTotal(cb, "expense");
                      const net = rev - exp;
                      return (
                        <td key={i} className={`py-2 text-right font-mono text-sm pr-2 ${net >= 0 ? "text-success" : "text-destructive"}`}>
                          {net < 0 && "("}{fmt(net)}{net < 0 && ")"}
                          {i < compBalances.length - 1 && (() => {
                            const prevNet = getSectionTotal(compBalances[i + 1], "revenue") - getSectionTotal(compBalances[i + 1], "expense");
                            return <PctBadge current={net} previous={prevNet} />;
                          })()}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            ) : (
              <>
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IncomeStatement;
