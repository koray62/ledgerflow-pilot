import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";
import { AlertTriangle, TrendingUp, DollarSign, Clock } from "lucide-react";

const forecastData = [
  { month: "Jan", actual: 120000, projected: null },
  { month: "Feb", actual: 124580, projected: null },
  { month: "Mar", actual: null, projected: 131000 },
  { month: "Apr", actual: null, projected: 128000 },
  { month: "May", actual: null, projected: 135000 },
  { month: "Jun", actual: null, projected: 142000 },
  { month: "Jul", actual: null, projected: 138000 },
  { month: "Aug", actual: null, projected: 150000 },
];

const metrics = [
  { label: "Monthly Burn Rate", value: "$38,200", icon: TrendingUp },
  { label: "Runway", value: "3.3 months", icon: Clock },
  { label: "Net Cash Position", value: "$124,580", icon: DollarSign },
];

const CashFlow = () => {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Cash Flow</h1>
        <p className="text-sm text-muted-foreground">Historical and projected cash flow analysis</p>
      </div>

      {/* Alert */}
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="text-sm font-medium text-foreground">Low runway warning</p>
          <p className="text-xs text-muted-foreground">At current burn rate, your cash runway is approximately 3.3 months. Consider reducing expenses or increasing revenue.</p>
        </div>
      </div>

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
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={forecastData}>
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
              <Area type="monotone" dataKey="actual" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.2)" strokeWidth={2} />
              <Area type="monotone" dataKey="projected" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.08)" strokeWidth={2} strokeDasharray="6 3" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default CashFlow;
