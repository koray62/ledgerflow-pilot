import { useState } from "react";
import { format, subDays } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";
import { AlertTriangle, TrendingUp, DollarSign, Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { formatCurrency as fmtCurrency, formatDisplayDate } from "@/lib/utils";

const CashFlow = () => {
  const { tenantId, defaultCurrency } = useTenant();
  const formatCurrency = (val: number) => fmtCurrency(val, defaultCurrency, { minimumFractionDigits: 0 });
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());

  const startStr = startDate ? format(startDate, "yyyy-MM-dd") : undefined;
  const endStr = endDate ? format(endDate, "yyyy-MM-dd") : undefined;

  // Fetch chart of accounts to identify cash accounts
  const { data: coaAccounts = [] } = useQuery({
    queryKey: ["cf-accounts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type, parent_id")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .is("deleted_at", null);
      return data ?? [];
    },
  });

  // Helper: collect a parent and all descendants (children + grandchildren)
  const collectDescendantIds = (parentCode: string, parentType: string) => {
    const parent = coaAccounts.find(a => a.account_type === parentType && a.code === parentCode);
    if (!parent) return [];
    const childIds = new Set(
      coaAccounts.filter(a => a.parent_id === parent.id).map(a => a.id)
    );
    return coaAccounts
      .filter(a =>
        a.id === parent.id ||
        a.parent_id === parent.id ||
        childIds.has(a.parent_id ?? "")
      )
      .map(a => a.id);
  };

  // Derive cash account IDs (code 1000 and all descendants)
  const cashAccountIds = collectDescendantIds("1000", "asset");

  // Derive AP account IDs (code 2000 and all descendants)
  const apAccountIds = collectDescendantIds("2000", "liability");

  // Compute cash balance from journal lines on cash accounts
  const { data: cashBalance = 0 } = useQuery({
    queryKey: ["cf-cash", tenantId, cashAccountIds],
    enabled: !!tenantId && cashAccountIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_lines")
        .select("debit, credit")
        .eq("tenant_id", tenantId!)
        .in("account_id", cashAccountIds)
        .is("deleted_at", null);
      return data?.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0) ?? 0;
    },
  });

  // Compute AP balance from journal lines (credit-normal: credits - debits = amount owed)
  const { data: apBalance = 0 } = useQuery({
    queryKey: ["cf-ap", tenantId, apAccountIds],
    enabled: !!tenantId && apAccountIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_lines")
        .select("debit, credit")
        .eq("tenant_id", tenantId!)
        .in("account_id", apAccountIds)
        .is("deleted_at", null);
      return data?.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0) ?? 0;
    },
  });

  // Monthly outflows from bills in selected range
  const { data: monthlyBurn = 0 } = useQuery({
    queryKey: ["cf-burn", tenantId, startStr, endStr],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase
        .from("bills")
        .select("total_amount")
        .eq("tenant_id", tenantId!);
      if (startStr) query = query.gte("bill_date", startStr);
      if (endStr) query = query.lte("bill_date", endStr);
      const { data } = await query;
      return data?.reduce((s, b) => s + Number(b.total_amount), 0) ?? 0;
    },
  });

  // Forecast entries
  const { data: forecasts = [] } = useQuery({
    queryKey: ["cf-forecasts", tenantId, startStr, endStr],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase
        .from("forecast_entries")
        .select("forecast_date, description, amount, category, is_recurring, recurrence_interval")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("forecast_date");
      if (startStr) query = query.gte("forecast_date", startStr);
      if (endStr) query = query.lte("forecast_date", endStr);
      const { data } = await query;
      return data ?? [];
    },
  });

  // Outstanding invoices (AR inflows)
  const { data: outstandingInvoices = [] } = useQuery({
    queryKey: ["cf-invoices", tenantId, startStr, endStr],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("due_date, total_amount, amount_paid, status")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("status", ["draft", "sent", "overdue"]);
      if (startStr) query = query.gte("due_date", startStr);
      if (endStr) query = query.lte("due_date", endStr);
      const { data } = await query;
      return (data ?? []).filter(inv => Number(inv.total_amount) - Number(inv.amount_paid) > 0);
    },
  });

  // Outstanding bills (AP outflows)
  const { data: outstandingBills = [], isLoading } = useQuery({
    queryKey: ["cf-bills-outstanding", tenantId, startStr, endStr],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase
        .from("bills")
        .select("due_date, total_amount, amount_paid, status")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("status", ["draft", "received", "overdue"]);
      if (startStr) query = query.gte("due_date", startStr);
      if (endStr) query = query.lte("due_date", endStr);
      const { data } = await query;
      return (data ?? []).filter(b => Number(b.total_amount) - Number(b.amount_paid) > 0);
    },
  });

  const netCashPosition = cashBalance - apBalance;
  const runway = monthlyBurn > 0 ? netCashPosition / monthlyBurn : null;
  const showWarning = runway !== null && runway < 6;

  // Build monthly forecast based on selected date range (or default 12 months from now)
  const chartData = (() => {
    const rangeStart = startDate ?? new Date();
    const rangeEnd = endDate ?? new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 12, 0);
    const firstMonth = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    const lastMonth = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);

    const months: { month: string; label: string; start: Date; end: Date }[] = [];
    const cursor = new Date(firstMonth);
    while (cursor <= lastMonth) {
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      months.push({
        month: cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        label: cursor.toLocaleDateString("en-US", { month: "short" }),
        start: new Date(cursor),
        end,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Opening balance data point
    const result: { month: string; inflow: number; outflow: number; balance: number }[] = [
      { month: "Opening", inflow: 0, outflow: 0, balance: cashBalance },
    ];

    let running = cashBalance;
    months.forEach((m) => {
      let inflow = 0;
      let outflow = 0;

      outstandingInvoices.forEach((inv) => {
        const due = new Date(inv.due_date);
        if (due >= m.start && due <= m.end) {
          inflow += Number(inv.total_amount) - Number(inv.amount_paid);
        }
      });

      outstandingBills.forEach((bill) => {
        const due = new Date(bill.due_date);
        if (due >= m.start && due <= m.end) {
          outflow += Number(bill.total_amount) - Number(bill.amount_paid);
        }
      });

      forecasts.forEach((f) => {
        const fd = new Date(f.forecast_date);
        if (f.is_recurring && f.recurrence_interval === "monthly") {
          if (fd <= m.end) {
            const amt = Number(f.amount);
            if (amt >= 0) inflow += amt; else outflow += Math.abs(amt);
          }
        } else {
          if (fd >= m.start && fd <= m.end) {
            const amt = Number(f.amount);
            if (amt >= 0) inflow += amt; else outflow += Math.abs(amt);
          }
        }
      });

      running += inflow - outflow;
      result.push({ month: m.month, inflow, outflow, balance: running });
    });

    return result;
  })();

  const metrics = [
    { label: "Burn Rate (Period)", value: formatCurrency(monthlyBurn), icon: TrendingUp },
    { label: "Runway", value: runway !== null ? `${runway.toFixed(1)} months` : "N/A", icon: Clock },
    { label: "Net Cash Position", value: formatCurrency(netCashPosition), icon: DollarSign },
    { label: "Accounts Payable", value: formatCurrency(apBalance), icon: AlertTriangle },
  ];

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cash Flow</h1>
          <p className="text-sm text-muted-foreground">Historical and projected cash flow analysis</p>
        </div>
        <div className="flex items-center gap-3">
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
              setStartDate(subDays(new Date(), 30));
              setEndDate(new Date());
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      {showWarning && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-medium text-foreground">Low runway warning</p>
            <p className="text-xs text-muted-foreground">
              At current burn rate, your cash runway is approximately {runway?.toFixed(1)} months.
            </p>
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <m.icon className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-card-foreground">{m.value}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">12-Month Cash Flow Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[360px] w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name === "balance" ? "Projected Balance" : name === "inflow" ? "Inflows" : "Outflows"]}
                />
                <Area type="monotone" dataKey="inflow" stroke="hsl(142 71% 45%)" fill="hsl(142 71% 45% / 0.1)" strokeWidth={2} name="inflow" />
                <Area type="monotone" dataKey="outflow" stroke="hsl(0 84% 60%)" fill="hsl(0 84% 60% / 0.1)" strokeWidth={2} name="outflow" />
                <Area type="monotone" dataKey="balance" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.15)" strokeWidth={2} strokeDasharray="6 3" name="balance" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Month</th>
                  <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Inflows</th>
                  <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Outflows</th>
                  <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Net</th>
                  <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, i) => {
                  const net = row.inflow - row.outflow;
                  return (
                    <tr key={i} className="border-b border-border/50 transition-colors hover:bg-muted/50">
                      <td className="py-2.5 font-medium text-foreground">{row.month}</td>
                      <td className="py-2.5 text-right font-mono text-green-600">{formatCurrency(row.inflow)}</td>
                      <td className="py-2.5 text-right font-mono text-destructive">{formatCurrency(row.outflow)}</td>
                      <td className={`py-2.5 text-right font-mono ${net < 0 ? "text-destructive" : "text-foreground"}`}>
                        {net < 0 ? `(${formatCurrency(Math.abs(net))})` : formatCurrency(net)}
                      </td>
                      <td className={`py-2.5 text-right font-mono font-medium ${row.balance < 0 ? "text-destructive" : "text-foreground"}`}>
                        {row.balance < 0 ? `(${formatCurrency(Math.abs(row.balance))})` : formatCurrency(row.balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Cash Flow Data Table */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Detailed Cash Flow Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Outstanding Invoices (Inflows) */}
            <div>
              <h3 className="text-sm font-semibold text-emerald-500 mb-2">Expected Inflows — Outstanding Invoices</h3>
              {outstandingInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No outstanding invoices.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Due Date</th>
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Total</th>
                      <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Paid</th>
                      <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstandingInvoices.map((inv, i) => {
                      const outstanding = Number(inv.total_amount) - Number(inv.amount_paid);
                      return (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/50">
                          <td className="py-2 text-foreground">{formatDisplayDate(inv.due_date, defaultCurrency)}</td>
                          <td className="py-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              inv.status === "overdue"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-accent/10 text-accent"
                            }`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="py-2 text-right font-mono text-muted-foreground">{formatCurrency(Number(inv.total_amount))}</td>
                          <td className="py-2 text-right font-mono text-muted-foreground">{formatCurrency(Number(inv.amount_paid))}</td>
                          <td className="py-2 text-right font-mono font-medium text-emerald-500">{formatCurrency(outstanding)}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={4} className="py-2 text-sm font-semibold text-foreground">Total Expected Inflows</td>
                      <td className="py-2 text-right font-mono font-bold text-emerald-500">
                        {formatCurrency(outstandingInvoices.reduce((s, inv) => s + Number(inv.total_amount) - Number(inv.amount_paid), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Outstanding Bills (Outflows) */}
            <div>
              <h3 className="text-sm font-semibold text-destructive mb-2">Expected Outflows — Outstanding Bills</h3>
              {outstandingBills.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No outstanding bills.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Due Date</th>
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Total</th>
                      <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Paid</th>
                      <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstandingBills.map((bill, i) => {
                      const outstanding = Number(bill.total_amount) - Number(bill.amount_paid);
                      return (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/50">
                          <td className="py-2 text-foreground">{formatDisplayDate(bill.due_date, defaultCurrency)}</td>
                          <td className="py-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              bill.status === "overdue"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-accent/10 text-accent"
                            }`}>
                              {bill.status}
                            </span>
                          </td>
                          <td className="py-2 text-right font-mono text-muted-foreground">{formatCurrency(Number(bill.total_amount))}</td>
                          <td className="py-2 text-right font-mono text-muted-foreground">{formatCurrency(Number(bill.amount_paid))}</td>
                          <td className="py-2 text-right font-mono font-medium text-destructive">{formatCurrency(outstanding)}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={4} className="py-2 text-sm font-semibold text-foreground">Total Expected Outflows</td>
                      <td className="py-2 text-right font-mono font-bold text-destructive">
                        {formatCurrency(outstandingBills.reduce((s, b) => s + Number(b.total_amount) - Number(b.amount_paid), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Forecast Entries */}
            <div>
              <h3 className="text-sm font-semibold text-accent mb-2">Forecast Entries</h3>
              {forecasts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No forecast entries.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Category</th>
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                      <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecasts.map((f, i) => {
                      const amt = Number(f.amount);
                      return (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/50">
                          <td className="py-2 text-foreground">{formatDisplayDate(f.forecast_date, defaultCurrency)}</td>
                          <td className="py-2 text-foreground">{f.description}</td>
                          <td className="py-2 text-muted-foreground">{f.category ?? "—"}</td>
                          <td className="py-2">
                            {f.is_recurring ? (
                              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                                Recurring · {f.recurrence_interval}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">One-time</span>
                            )}
                          </td>
                          <td className={`py-2 text-right font-mono font-medium ${amt >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                            {amt >= 0 ? "+" : "−"}{formatCurrency(Math.abs(amt))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CashFlow;
