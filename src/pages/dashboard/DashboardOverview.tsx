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
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);

const DashboardOverview = () => {
  const { tenantId } = useTenant();

  // KPI: total cash from bank accounts
  const { data: cashBalance = 0 } = useQuery({
    queryKey: ["cash-balance", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("current_balance")
        .eq("tenant_id", tenantId!);
      return data?.reduce((sum, a) => sum + Number(a.current_balance), 0) ?? 0;
    },
  });

  // KPI: total AR (unpaid invoices)
  const { data: arTotal = 0 } = useQuery({
    queryKey: ["ar-total", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("total_amount, amount_paid")
        .eq("tenant_id", tenantId!)
        .in("status", ["sent", "overdue"]);
      return data?.reduce((sum, i) => sum + (Number(i.total_amount) - Number(i.amount_paid)), 0) ?? 0;
    },
  });

  // KPI: total AP (unpaid bills)
  const { data: apTotal = 0 } = useQuery({
    queryKey: ["ap-total", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bills")
        .select("total_amount, amount_paid")
        .eq("tenant_id", tenantId!)
        .in("status", ["received", "overdue"]);
      return data?.reduce((sum, b) => sum + (Number(b.total_amount) - Number(b.amount_paid)), 0) ?? 0;
    },
  });

  // KPI: journal entry count
  const { data: entryCount = 0 } = useQuery({
    queryKey: ["entry-count", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { count } = await supabase
        .from("journal_entries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!);
      return count ?? 0;
    },
  });

  // Recent journal entries
  const { data: recentEntries = [], isLoading: loadingEntries } = useQuery({
    queryKey: ["recent-entries", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("entry_date, description, entry_number, status")
        .eq("tenant_id", tenantId!)
        .order("entry_date", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  // Journal lines for recent entries (for amounts)
  const { data: recentLines = [] } = useQuery({
    queryKey: ["recent-entry-lines", tenantId, recentEntries],
    enabled: !!tenantId && recentEntries.length > 0,
    queryFn: async () => {
      const ids = recentEntries.map((e: any) => e.entry_number);
      if (!ids.length) return [];
      // Get total debits per entry
      const { data } = await supabase
        .from("journal_lines")
        .select("journal_entry_id, debit")
        .eq("tenant_id", tenantId!)
        .gt("debit", 0);
      return data ?? [];
    },
  });

  const stats = [
    { label: "Cash Balance", value: formatCurrency(cashBalance), icon: DollarSign, up: cashBalance >= 0 },
    { label: "Accounts Receivable", value: formatCurrency(arTotal), icon: TrendingUp, up: true },
    { label: "Accounts Payable", value: formatCurrency(apTotal), icon: TrendingDown, up: false },
    { label: "Journal Entries", value: entryCount.toLocaleString(), icon: FileText, up: true },
  ];

  if (!tenantId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">No organization found. Please complete signup.</p>
      </div>
    );
  }

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
                </div>
                <p className="mt-3 text-2xl font-bold text-card-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Recent Entries */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Journal Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingEntries ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : recentEntries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No journal entries yet. Create your first entry to get started.</p>
          ) : (
            <div className="space-y-3">
              {recentEntries.map((entry: any, i: number) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground font-mono w-14">
                      {new Date(entry.entry_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">{entry.entry_number}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    entry.status === "posted" ? "bg-success/10 text-success" :
                    entry.status === "draft" ? "bg-muted text-muted-foreground" :
                    "bg-warning/10 text-warning"
                  }`}>
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardOverview;
