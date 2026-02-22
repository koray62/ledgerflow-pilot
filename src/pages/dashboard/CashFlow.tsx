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
  const { data: forecasts = [], isLoading } = useQuery({
    queryKey: ["cf-forecasts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("forecast_entries")
        .select("forecast_date, description, amount, category")
        .eq("tenant_id", tenantId!)
        .order("forecast_date");
      return data ?? [];
    },
  });

  const runway = monthlyBurn > 0 ? cashBalance / monthlyBurn : null;
  const showWarning = runway !== null && runway < 6;

  // Build simple forecast chart data from forecast_entries
  const chartData = forecasts.length > 0
    ? forecasts.reduce<{ month: string; projected: number }[]>((acc, f) => {
        const month = new Date(f.forecast_date).toLocaleDateString("en-US", { month: "short" });
        const existing = acc.find((a) => a.month === month);
        if (existing) {
          existing.projected += Number(f.amount);
        } else {
          acc.push({ month, projected: Number(f.amount) });
        }
        return acc;
      }, [])
    : [];

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
          <CardTitle className="text-base">Cash Flow Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[320px] w-full rounded-lg" />
          ) : chartData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No forecast data yet. Add forecast entries to see projections here.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area type="monotone" dataKey="projected" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.15)" strokeWidth={2} strokeDasharray="6 3" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CashFlow;
