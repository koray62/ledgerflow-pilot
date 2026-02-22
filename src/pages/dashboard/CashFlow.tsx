import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";
import { AlertTriangle, TrendingUp, DollarSign, Clock } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);

const CashFlow = () => {
  const { tenantId } = useTenant();

  // Cash balance from bank accounts
  const { data: cashBalance = 0 } = useQuery({
    queryKey: ["cf-cash", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("current_balance")
        .eq("tenant_id", tenantId!);
      return data?.reduce((s, a) => s + Number(a.current_balance), 0) ?? 0;
    },
  });

  // Monthly outflows from bills
  const { data: monthlyBurn = 0 } = useQuery({
    queryKey: ["cf-burn", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const { data } = await supabase
        .from("bills")
        .select("total_amount")
        .eq("tenant_id", tenantId!)
        .gte("bill_date", thirtyDaysAgo);
      return data?.reduce((s, b) => s + Number(b.total_amount), 0) ?? 0;
    },
  });

  // Forecast entries
  const { data: forecasts = [] } = useQuery({
    queryKey: ["cf-forecasts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("forecast_entries")
        .select("forecast_date, description, amount, category, is_recurring, recurrence_interval")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("forecast_date");
      return data ?? [];
    },
  });

  // Outstanding invoices (AR inflows)
  const { data: outstandingInvoices = [] } = useQuery({
    queryKey: ["cf-invoices", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("due_date, total_amount, amount_paid, status")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("status", ["draft", "sent", "overdue"]);
      return data ?? [];
    },
  });

  // Outstanding bills (AP outflows)
  const { data: outstandingBills = [], isLoading } = useQuery({
    queryKey: ["cf-bills-outstanding", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bills")
        .select("due_date, total_amount, amount_paid, status")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("status", ["draft", "received", "overdue"]);
      return data ?? [];
    },
  });

  const runway = monthlyBurn > 0 ? cashBalance / monthlyBurn : null;
  const showWarning = runway !== null && runway < 6;

  // Build 12-month forecast starting from current date
  const chartData = (() => {
    const now = new Date();
    const months: { month: string; label: string; start: Date; end: Date }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);
      months.push({
        month: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        label: d.toLocaleDateString("en-US", { month: "short" }),
        start: d,
        end,
      });
    }

    let running = cashBalance;
    return months.map((m) => {
      let inflow = 0;
      let outflow = 0;

      // AR inflows from outstanding invoices due this month
      outstandingInvoices.forEach((inv) => {
        const due = new Date(inv.due_date);
        if (due >= m.start && due <= m.end) {
          inflow += Number(inv.total_amount) - Number(inv.amount_paid);
        }
      });

      // AP outflows from outstanding bills due this month
      outstandingBills.forEach((bill) => {
        const due = new Date(bill.due_date);
        if (due >= m.start && due <= m.end) {
          outflow += Number(bill.total_amount) - Number(bill.amount_paid);
        }
      });

      // Forecast entries (manual + recurring)
      forecasts.forEach((f) => {
        const fd = new Date(f.forecast_date);
        if (f.is_recurring && f.recurrence_interval === "monthly") {
          // Recurring monthly: applies every month at or after forecast_date
          if (fd <= m.end) {
            const amt = Number(f.amount);
            if (amt >= 0) inflow += amt; else outflow += Math.abs(amt);
          }
        } else {
          // One-time: only in its month
          if (fd >= m.start && fd <= m.end) {
            const amt = Number(f.amount);
            if (amt >= 0) inflow += amt; else outflow += Math.abs(amt);
          }
        }
      });

      running += inflow - outflow;
      return { month: m.month, inflow, outflow, balance: running };
    });
  })();

  const metrics = [
    { label: "Monthly Burn Rate", value: formatCurrency(monthlyBurn), icon: TrendingUp },
    { label: "Runway", value: runway !== null ? `${runway.toFixed(1)} months` : "N/A", icon: Clock },
    { label: "Net Cash Position", value: formatCurrency(cashBalance), icon: DollarSign },
  ];

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Cash Flow</h1>
        <p className="text-sm text-muted-foreground">Historical and projected cash flow analysis</p>
      </div>

      {showWarning && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-medium text-foreground">Low runway warning</p>
            <p className="text-xs text-muted-foreground">
              At current burn rate, your cash runway is approximately {runway?.toFixed(1)} months. Consider reducing expenses or increasing revenue.
            </p>
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
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

      {/* Forecast Chart */}
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

      {/* Forecast Breakdown Table */}
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
    </div>
  );
};

export default CashFlow;
