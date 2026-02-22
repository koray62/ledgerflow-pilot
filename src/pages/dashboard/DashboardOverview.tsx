import { motion } from "framer-motion";
import {
  DollarSign, TrendingUp, TrendingDown, FileText,
  ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from "recharts";

const stats = [
  { label: "Cash Balance", value: "$124,580", change: "+12.5%", up: true, icon: DollarSign },
  { label: "Accounts Receivable", value: "$34,200", change: "+8.2%", up: true, icon: TrendingUp },
  { label: "Accounts Payable", value: "$18,750", change: "-4.1%", up: false, icon: TrendingDown },
  { label: "Journal Entries", value: "1,284", change: "+23", up: true, icon: FileText },
];

const cashFlowData = [
  { month: "Jul", inflow: 42000, outflow: 31000 },
  { month: "Aug", inflow: 38000, outflow: 28000 },
  { month: "Sep", inflow: 55000, outflow: 35000 },
  { month: "Oct", inflow: 47000, outflow: 32000 },
  { month: "Nov", inflow: 61000, outflow: 38000 },
  { month: "Dec", inflow: 52000, outflow: 40000 },
  { month: "Jan", inflow: 58000, outflow: 36000 },
  { month: "Feb", inflow: 65000, outflow: 42000 },
];

const revenueData = [
  { month: "Jul", revenue: 28000 },
  { month: "Aug", revenue: 32000 },
  { month: "Sep", revenue: 38000 },
  { month: "Oct", revenue: 35000 },
  { month: "Nov", revenue: 42000 },
  { month: "Dec", revenue: 39000 },
  { month: "Jan", revenue: 48000 },
  { month: "Feb", revenue: 52000 },
];

const recentEntries = [
  { date: "Feb 20", description: "Office Rent Payment", amount: "-$3,200", account: "Rent Expense" },
  { date: "Feb 19", description: "Client Invoice #1042", amount: "+$8,500", account: "Accounts Receivable" },
  { date: "Feb 18", description: "Software Subscription", amount: "-$299", account: "SaaS Expense" },
  { date: "Feb 17", description: "Consulting Revenue", amount: "+$12,000", account: "Revenue" },
  { date: "Feb 16", description: "Payroll Processing", amount: "-$24,500", account: "Salaries" },
];

const DashboardOverview = () => {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back. Here's your financial overview.</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
                    <stat.icon className="h-4 w-4 text-accent" />
                  </div>
                  <span className={`flex items-center gap-1 text-xs font-medium ${stat.up ? "text-success" : "text-destructive"}`}>
                    {stat.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {stat.change}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-bold text-card-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cash Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={cashFlowData}>
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
                <Area type="monotone" dataKey="inflow" stackId="1" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.2)" />
                <Area type="monotone" dataKey="outflow" stackId="2" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.1)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={revenueData}>
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
                <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Entries */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Journal Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentEntries.map((entry, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground font-mono w-14">{entry.date}</span>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">{entry.description}</p>
                    <p className="text-xs text-muted-foreground">{entry.account}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold font-mono ${entry.amount.startsWith("+") ? "text-success" : "text-destructive"}`}>
                  {entry.amount}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardOverview;
