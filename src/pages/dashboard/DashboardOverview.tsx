import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  DollarSign, TrendingUp, TrendingDown, FileText, Receipt,
  CreditCard, Activity, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from "recharts";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatCurrency as fmtCurrency, formatDisplayDate } from "@/lib/utils";
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";

const DashboardOverview = () => {
  const { tenantId, tenantName, defaultCurrency } = useTenant();
  const fmt = (val: number) => fmtCurrency(val, defaultCurrency, { minimumFractionDigits: 0 });

  // ── All journal lines with account info ──
  const { data: journalData, isLoading: loadingJournal } = useQuery({
    queryKey: ["dashboard-journal-data", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      // Get all posted journal entries
      const { data: entries } = await supabase
        .from("journal_entries")
        .select("id, entry_date, status")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null);

      const postedIds = (entries ?? []).filter(e => e.status === "posted").map(e => e.id);
      const allEntries = entries ?? [];

      // Get all journal lines with account info
      const { data: lines } = await supabase
        .from("journal_lines")
        .select("journal_entry_id, account_id, debit, credit")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null);

      // Get accounts
      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null);

      const accountMap = new Map((accounts ?? []).map(a => [a.id, a]));
      const entryMap = new Map(allEntries.map(e => [e.id, e]));
      const postedSet = new Set(postedIds);

      return { lines: lines ?? [], accountMap, entryMap, postedSet, allEntries };
    },
  });

  // ── Compute all KPIs from journal lines ──
  const kpis = useMemo(() => {
    if (!journalData) return null;
    const { lines, accountMap, postedSet } = journalData;

    let cashBalance = 0;
    let arBalance = 0;
    let apBalance = 0;
    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const line of lines) {
      if (!postedSet.has(line.journal_entry_id)) continue;
      const account = accountMap.get(line.account_id);
      if (!account) continue;

      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;
      const code = account.code;
      const type = account.account_type;

      // Cash & bank accounts (typically 1000, 1020.xx)
      if (type === "asset" && (code.startsWith("1000") || code.startsWith("1020"))) {
        cashBalance += debit - credit;
      }
      // Accounts Receivable (typically 1100.xx)
      if (type === "asset" && (code.startsWith("1100") || code.startsWith("1200"))) {
        arBalance += debit - credit;
      }
      // Accounts Payable (typically 2000, 2010.xx)
      if (type === "liability" && (code.startsWith("2000") || code.startsWith("2010"))) {
        apBalance += credit - debit;
      }
      // Revenue
      if (type === "revenue") {
        totalRevenue += credit - debit;
      }
      // Expenses
      if (type === "expense") {
        totalExpenses += debit - credit;
      }
    }

    const netIncome = totalRevenue - totalExpenses;

    return { cashBalance, arBalance, apBalance, totalRevenue, totalExpenses, netIncome };
  }, [journalData]);

  // ── Monthly revenue/expense trend (last 6 months) ──
  const monthlyTrend = useMemo(() => {
    if (!journalData) return [];
    const { lines, accountMap, postedSet, entryMap } = journalData;
    const now = new Date();
    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      months.push({
        label: format(d, "MMM"),
        start: startOfMonth(d),
        end: endOfMonth(d),
      });
    }

    return months.map(m => {
      let revenue = 0;
      let expenses = 0;
      for (const line of lines) {
        if (!postedSet.has(line.journal_entry_id)) continue;
        const entry = entryMap.get(line.journal_entry_id);
        if (!entry) continue;
        const entryDate = parseISO(entry.entry_date);
        if (entryDate < m.start || entryDate > m.end) continue;
        const account = accountMap.get(line.account_id);
        if (!account) continue;
        if (account.account_type === "revenue") revenue += (Number(line.credit) - Number(line.debit));
        if (account.account_type === "expense") expenses += (Number(line.debit) - Number(line.credit));
      }
      return { month: m.label, revenue, expenses, net: revenue - expenses };
    });
  }, [journalData]);

  // ── Overdue invoices & bills ──
  const { data: overdueInvoices = [] } = useQuery({
    queryKey: ["overdue-invoices", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_id, total_amount, amount_paid, due_date, status")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("status", ["overdue"]);
      return data ?? [];
    },
  });

  const { data: overdueBills = [] } = useQuery({
    queryKey: ["overdue-bills", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bills")
        .select("id, bill_number, vendor_id, total_amount, amount_paid, due_date, status")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("status", ["overdue"]);
      return data ?? [];
    },
  });

  // ── Recent journal entries ──
  const { data: recentEntries = [], isLoading: loadingEntries } = useQuery({
    queryKey: ["recent-entries", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("id, entry_date, description, entry_number, status")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("entry_date", { ascending: false })
        .limit(7);
      return data ?? [];
    },
  });

  // Entry totals (sum of debits per entry)
  const entryTotals = useMemo(() => {
    if (!journalData || !recentEntries.length) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const line of journalData.lines) {
      const d = Number(line.debit) || 0;
      if (d > 0) map.set(line.journal_entry_id, (map.get(line.journal_entry_id) ?? 0) + d);
    }
    return map;
  }, [journalData, recentEntries]);

  // ── Expense breakdown by parent account ──
  const expenseBreakdown = useMemo(() => {
    if (!journalData) return [];
    const { lines, accountMap, postedSet } = journalData;
    const totals = new Map<string, number>();

    for (const line of lines) {
      if (!postedSet.has(line.journal_entry_id)) continue;
      const account = accountMap.get(line.account_id);
      if (!account || account.account_type !== "expense") continue;
      const parentCode = account.code.includes(".") ? account.code.split(".")[0] : account.code;
      const parentName = account.code.includes(".") 
        ? (Array.from(accountMap.values()).find(a => a.code === parentCode)?.name ?? account.name)
        : account.name;
      const key = `${parentCode}|${parentName}`;
      const amount = (Number(line.debit) - Number(line.credit));
      totals.set(key, (totals.get(key) ?? 0) + amount);
    }

    return Array.from(totals.entries())
      .map(([key, amount]) => {
        const [code, name] = key.split("|");
        return { code, name, amount };
      })
      .filter(e => e.amount !== 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [journalData]);

  const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--chart-3, 150 60% 50%))", "hsl(var(--chart-4, 40 80% 55%))", "hsl(var(--chart-5, 280 60% 55%))", "hsl(var(--muted-foreground))"];

  const totalEntries = journalData?.allEntries.length ?? 0;
  const postedCount = journalData?.postedSet.size ?? 0;
  const draftCount = totalEntries - postedCount;

  if (!tenantId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">No organization found. Please complete signup.</p>
      </div>
    );
  }

  const isLoading = loadingJournal;

  const stats = [
    { label: "Cash Balance", value: kpis ? fmt(kpis.cashBalance) : "–", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Accounts Receivable", value: kpis ? fmt(kpis.arBalance) : "–", icon: ArrowUpRight, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Accounts Payable", value: kpis ? fmt(kpis.apBalance) : "–", icon: ArrowDownRight, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
    { label: "Revenue (YTD)", value: kpis ? fmt(kpis.totalRevenue) : "–", icon: TrendingUp, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
    { label: "Expenses (YTD)", value: kpis ? fmt(kpis.totalExpenses) : "–", icon: TrendingDown, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
    { label: "Net Income", value: kpis ? fmt(kpis.netIncome) : "–", icon: Activity, color: kpis && kpis.netIncome >= 0 ? "text-emerald-600" : "text-red-600", bg: kpis && kpis.netIncome >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30" },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back. Here's your financial overview.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="h-full">
              <CardContent className="p-4">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                {isLoading ? (
                  <Skeleton className="mt-3 h-7 w-24" />
                ) : (
                  <p className="mt-3 text-xl font-bold text-card-foreground truncate">{stat.value}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Alert cards for overdue items */}
      {(overdueInvoices.length > 0 || overdueBills.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {overdueInvoices.length > 0 && (
            <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{overdueInvoices.length} Overdue Invoice{overdueInvoices.length > 1 ? "s" : ""}</p>
                  <p className="text-xs text-muted-foreground">
                    Total: {fmt(overdueInvoices.reduce((s, inv) => s + (Number(inv.total_amount) - Number(inv.amount_paid)), 0))}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {overdueBills.length > 0 && (
            <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{overdueBills.length} Overdue Bill{overdueBills.length > 1 ? "s" : ""}</p>
                  <p className="text-xs text-muted-foreground">
                    Total: {fmt(overdueBills.reduce((s, b) => s + (Number(b.total_amount) - Number(b.amount_paid)), 0))}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Revenue vs Expenses Trend */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue vs Expenses</CardTitle>
            <CardDescription>Last 6 months trend</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : monthlyTrend.every(m => m.revenue === 0 && m.expenses === 0) ? (
              <div className="flex h-[240px] items-center justify-center">
                <p className="text-sm text-muted-foreground">No posted entries in the last 6 months.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={monthlyTrend}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => fmtCurrency(v, defaultCurrency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, name: string) => [fmt(value), name === "revenue" ? "Revenue" : "Expenses"]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" fill="url(#expGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expense Breakdown</CardTitle>
            <CardDescription>Top categories</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : expenseBreakdown.length === 0 ? (
              <div className="flex h-[240px] items-center justify-center">
                <p className="text-sm text-muted-foreground">No expense data.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={expenseBreakdown} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => fmtCurrency(v, defaultCurrency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [fmt(value), "Amount"]}
                  />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                    {expenseBreakdown.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: Recent entries + Quick stats */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Entries */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Journal Entries</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingEntries ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : recentEntries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No journal entries yet.</p>
            ) : (
              <div className="space-y-2">
                {recentEntries.map((entry: any) => {
                  const total = entryTotals.get(entry.id) ?? 0;
                  return (
                    <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-muted-foreground font-mono shrink-0">
                          {formatDisplayDate(entry.entry_date, defaultCurrency, "short")}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-card-foreground truncate">{entry.description}</p>
                          <p className="text-xs text-muted-foreground">{entry.entry_number}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {total > 0 && <span className="text-sm font-medium text-foreground">{fmt(total)}</span>}
                        <Badge variant={entry.status === "posted" ? "default" : entry.status === "draft" ? "secondary" : "outline"} className="text-xs capitalize">
                          {entry.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Entries</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{isLoading ? "–" : totalEntries}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">Posted</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{isLoading ? "–" : postedCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-muted-foreground">Drafts</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{isLoading ? "–" : draftCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-muted-foreground">Overdue Invoices</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{overdueInvoices.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-red-500" />
                <span className="text-sm text-muted-foreground">Overdue Bills</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{overdueBills.length}</span>
            </div>
            {kpis && kpis.totalRevenue > 0 && (
              <>
                <hr className="border-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Profit Margin</span>
                  <span className={`text-sm font-semibold ${kpis.netIncome >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {((kpis.netIncome / kpis.totalRevenue) * 100).toFixed(1)}%
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

export default DashboardOverview;
