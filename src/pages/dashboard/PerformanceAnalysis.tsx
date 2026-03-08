import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTenant } from "@/hooks/useTenant";
import { formatCurrency as fmtCurrency, formatDisplayDate } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Percent, Shield, Activity, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type AccountType = Database["public"]["Enums"]["account_type"];

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
}

// fmt is now defined inside component to use defaultCurrency

const pctFmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 3, CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fetchLineTotals = async (tenantId: string, startStr: string, endStr: string) => {
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "posted")
    .is("deleted_at", null)
    .gte("entry_date", startStr)
    .lte("entry_date", endStr);

  if (!entries || entries.length === 0) return [];

  const { data } = await supabase
    .from("journal_lines")
    .select("account_id, debit, credit")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("journal_entry_id", entries.map((e) => e.id));

  return data ?? [];
};

const fetchMonthlyLineTotals = async (tenantId: string, year: number) => {
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("id, entry_date")
    .eq("tenant_id", tenantId)
    .eq("status", "posted")
    .is("deleted_at", null)
    .gte("entry_date", `${year}-01-01`)
    .lte("entry_date", `${year}-12-31`);

  if (!entries || entries.length === 0) return [];

  const entryIds = entries.map((e) => e.id);
  const { data: lines } = await supabase
    .from("journal_lines")
    .select("account_id, debit, credit, journal_entry_id")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("journal_entry_id", entryIds);

  const entryMonthMap = new Map<string, number>();
  for (const e of entries) {
    entryMonthMap.set(e.id, new Date(e.entry_date).getMonth());
  }

  return (lines ?? []).map((l) => ({
    ...l,
    month: entryMonthMap.get(l.journal_entry_id) ?? 0,
  }));
};

interface YearlyData {
  year: number;
  revenue: number;
  expenses: number;
  netIncome: number;
  netProfitMargin: number;
  expenseRatio: number;
  revenueGrowth: number | null;
  expenseGrowth: number | null;
  operatingLeverage: number | null;
  quickRatio: number | null;
  monthlyAvgRevenue: number;
  monthlyAvgExpenses: number;
  cashBalance: number;
  arBalance: number;
  apBalance: number;
}

const PerformanceAnalysis = () => {
  const { tenantId, tenantName, defaultCurrency } = useTenant();
  const fmt = (n: number) => fmtCurrency(n, defaultCurrency, { maximumFractionDigits: 0 });
  const chartsRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [drillYear, setDrillYear] = useState<number>(CURRENT_YEAR);

  // Fetch accounts
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ["perf-accounts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("code");
      return (data ?? []) as Account[];
    },
  });

  // Fetch line totals for all years in a single query
  const { data: allYearLines = {}, isLoading: loadingYears } = useQuery({
    queryKey: ["perf-lines-all", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const result: Record<number, Awaited<ReturnType<typeof fetchLineTotals>>> = {};
      await Promise.all(
        YEARS.map(async (year) => {
          result[year] = await fetchLineTotals(tenantId!, `${year}-01-01`, `${year}-12-31`);
        })
      );
      return result;
    },
  });

  // Monthly drill-down query
  const { data: monthlyLines = [], isLoading: loadingMonthly } = useQuery({
    queryKey: ["perf-monthly", tenantId, drillYear],
    enabled: !!tenantId,
    queryFn: () => fetchMonthlyLineTotals(tenantId!, drillYear),
  });

  // Cash balance (current snapshot)
  const { data: cashBalance = 0 } = useQuery({
    queryKey: ["perf-cash", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("current_balance")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .is("deleted_at", null);
      return (data ?? []).reduce((s, a) => s + Number(a.current_balance), 0);
    },
  });

  // AR (outstanding invoices)
  const { data: arData = [] } = useQuery({
    queryKey: ["perf-ar", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("total_amount, amount_paid, invoice_date, status")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("status", ["sent", "overdue"]);
      return data ?? [];
    },
  });

  // AP (outstanding bills)
  const { data: apData = [] } = useQuery({
    queryKey: ["perf-ap", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bills")
        .select("total_amount, amount_paid, bill_date, status")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("status", ["received", "overdue"]);
      return data ?? [];
    },
  });

  const isLoading = loadingAccounts || loadingYears;

  // Compute per-year data
  const yearlyData: YearlyData[] = useMemo(() => {
    if (isLoading || accounts.length === 0) return [];

    const revenueAccIds = new Set(accounts.filter((a) => a.account_type === "revenue").map((a) => a.id));
    const expenseAccIds = new Set(accounts.filter((a) => a.account_type === "expense").map((a) => a.id));

    const results: YearlyData[] = YEARS.map((year, idx) => {
      const lines = allYearLines[year] ?? [];

      let revenue = 0;
      let expenses = 0;
      for (const l of lines) {
        const d = Number(l.debit);
        const c = Number(l.credit);
        if (revenueAccIds.has(l.account_id)) revenue += c - d;
        if (expenseAccIds.has(l.account_id)) expenses += d - c;
      }

      const netIncome = revenue - expenses;
      const netProfitMargin = revenue !== 0 ? (netIncome / revenue) * 100 : 0;
      const expenseRatio = revenue !== 0 ? (expenses / revenue) * 100 : 0;
      const monthsElapsed = year === CURRENT_YEAR ? new Date().getMonth() + 1 : 12;

      const arBal = arData.reduce((s, inv) => s + (Number(inv.total_amount) - Number(inv.amount_paid)), 0);
      const apBal = apData.reduce((s, b) => s + (Number(b.total_amount) - Number(b.amount_paid)), 0);

      return {
        year,
        revenue,
        expenses,
        netIncome,
        netProfitMargin,
        expenseRatio,
        revenueGrowth: null,
        expenseGrowth: null,
        operatingLeverage: null,
        quickRatio: year === CURRENT_YEAR && apBal > 0 ? (cashBalance + arBal) / apBal : null,
        monthlyAvgRevenue: revenue / monthsElapsed,
        monthlyAvgExpenses: expenses / monthsElapsed,
        cashBalance: year === CURRENT_YEAR ? cashBalance : 0,
        arBalance: year === CURRENT_YEAR ? arBal : 0,
        apBalance: year === CURRENT_YEAR ? apBal : 0,
      };
    });

    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
      if (prev.revenue !== 0) {
        curr.revenueGrowth = ((curr.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100;
      }
      if (prev.expenses !== 0) {
        curr.expenseGrowth = ((curr.expenses - prev.expenses) / Math.abs(prev.expenses)) * 100;
      }
      if (curr.revenueGrowth !== null && curr.expenseGrowth !== null && curr.expenseGrowth !== 0) {
        curr.operatingLeverage = curr.revenueGrowth / curr.expenseGrowth;
      }
    }

    return results;
  }, [isLoading, accounts, allYearLines, cashBalance, arData, apData]);

  // Monthly drill-down data
  const monthlyData = useMemo(() => {
    if (accounts.length === 0 || monthlyLines.length === 0) return [];

    const revenueAccIds = new Set(accounts.filter((a) => a.account_type === "revenue").map((a) => a.id));
    const expenseAccIds = new Set(accounts.filter((a) => a.account_type === "expense").map((a) => a.id));

    return MONTH_NAMES.map((name, monthIdx) => {
      const lines = monthlyLines.filter((l) => l.month === monthIdx);
      let revenue = 0;
      let expenses = 0;
      for (const l of lines) {
        const d = Number(l.debit);
        const c = Number(l.credit);
        if (revenueAccIds.has(l.account_id)) revenue += c - d;
        if (expenseAccIds.has(l.account_id)) expenses += d - c;
      }
      const netIncome = revenue - expenses;
      const margin = revenue !== 0 ? (netIncome / revenue) * 100 : 0;
      return { month: name, revenue, expenses, netIncome, margin };
    });
  }, [accounts, monthlyLines]);

  // CAGR calculation
  const cagr = useMemo(() => {
    if (yearlyData.length < 2) return { revenue: null, expenses: null, netIncome: null };
    const first = yearlyData[0];
    const last = yearlyData[yearlyData.length - 1];
    const n = YEARS.length - 1;
    const calcCagr = (start: number, end: number) => {
      if (start <= 0 || end <= 0) return null;
      return (Math.pow(end / start, 1 / n) - 1) * 100;
    };
    return {
      revenue: calcCagr(first.revenue, last.revenue),
      expenses: calcCagr(first.expenses, last.expenses),
      netIncome: first.netIncome > 0 && last.netIncome > 0
        ? calcCagr(first.netIncome, last.netIncome)
        : null,
    };
  }, [yearlyData]);

  // Monthly totals for drill-down
  const monthlyTotals = useMemo(() => {
    const totalRev = monthlyData.reduce((s, m) => s + m.revenue, 0);
    const totalExp = monthlyData.reduce((s, m) => s + m.expenses, 0);
    const totalNet = totalRev - totalExp;
    return { revenue: totalRev, expenses: totalExp, netIncome: totalNet };
  }, [monthlyData]);

  const current = yearlyData.find((d) => d.year === CURRENT_YEAR);
  const previous = yearlyData.find((d) => d.year === CURRENT_YEAR - 1);

  const chartData = yearlyData.map((d) => ({
    year: d.year.toString(),
    Revenue: d.revenue,
    Expenses: d.expenses,
    "Net Income": d.netIncome,
    "Net Profit Margin": d.netProfitMargin,
    "Expense Ratio": d.expenseRatio,
  }));

  const YoYBadge = ({ current: c, previous: p }: { current?: number; previous?: number }) => {
    if (c === undefined || p === undefined || p === 0) return null;
    const pct = ((c - p) / Math.abs(p)) * 100;
    const isPos = pct >= 0;
    return (
      <Badge
        variant="outline"
        className={`text-[10px] ${isPos ? "text-success border-success/30" : "text-destructive border-destructive/30"}`}
      >
        {isPos ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
      </Badge>
    );
  };

  if (!tenantId) {
    return (
      <div className="p-6 lg:p-8">
        <p className="text-muted-foreground">Please select or create an organization first.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Performance Analysis</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const metricRows = [
    { label: "Revenue", key: "revenue", format: fmt },
    { label: "Expenses", key: "expenses", format: fmt },
    { label: "Net Income", key: "netIncome", format: fmt },
    { label: "Net Profit Margin %", key: "netProfitMargin", format: (n: number) => `${n.toFixed(1)}%` },
    { label: "Expense Ratio %", key: "expenseRatio", format: (n: number) => `${n.toFixed(1)}%` },
    { label: "Revenue Growth %", key: "revenueGrowth", format: (n: number | null) => n !== null ? pctFmt(n) : "—" },
    { label: "Expense Growth %", key: "expenseGrowth", format: (n: number | null) => n !== null ? pctFmt(n) : "—" },
    { label: "Operating Leverage", key: "operatingLeverage", format: (n: number | null) => n !== null ? n.toFixed(2) + "x" : "—" },
    { label: "Quick Ratio", key: "quickRatio", format: (n: number | null) => n !== null ? n.toFixed(2) : "—" },
    { label: "Monthly Avg Revenue", key: "monthlyAvgRevenue", format: fmt },
    { label: "Monthly Avg Expenses (Burn)", key: "monthlyAvgExpenses", format: fmt },
  ];

  const ratioCards = [
    {
      title: "Quick Ratio",
      description: "(Cash + AR) / AP",
      icon: Shield,
      values: yearlyData.map((d) => ({ year: d.year, value: d.quickRatio })),
      format: (n: number | null) => n !== null ? n.toFixed(2) : "—",
      good: (n: number | null) => n !== null && n >= 1,
    },
    {
      title: "Net Profit Margin",
      description: "Net Income / Revenue",
      icon: Percent,
      values: yearlyData.map((d) => ({ year: d.year, value: d.netProfitMargin })),
      format: (n: number) => `${n.toFixed(1)}%`,
      good: (n: number | null) => n !== null && n > 0,
    },
    {
      title: "Expense Ratio",
      description: "Expenses / Revenue",
      icon: TrendingDown,
      values: yearlyData.map((d) => ({ year: d.year, value: d.expenseRatio })),
      format: (n: number) => `${n.toFixed(1)}%`,
      good: (n: number | null) => n !== null && n < 100,
    },
    {
      title: "Revenue Growth",
      description: "Year-over-Year %",
      icon: TrendingUp,
      values: yearlyData.map((d) => ({ year: d.year, value: d.revenueGrowth })),
      format: (n: number | null) => n !== null ? pctFmt(n) : "—",
      good: (n: number | null) => n !== null && n > 0,
    },
    {
      title: "Operating Leverage",
      description: "Revenue Growth / Expense Growth",
      icon: Activity,
      values: yearlyData.map((d) => ({ year: d.year, value: d.operatingLeverage })),
      format: (n: number | null) => n !== null ? n.toFixed(2) + "x" : "—",
      good: (n: number | null) => n !== null && n > 1,
    },
    {
      title: "Burn Rate",
      description: "Monthly Avg Expenses",
      icon: DollarSign,
      values: yearlyData.map((d) => ({ year: d.year, value: d.monthlyAvgExpenses })),
      format: (n: number) => fmt(n),
      good: () => true,
    },
  ];

  

  // PDF Export
  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 14;
      const contentW = pageW - margin * 2;
      let y = margin;

      const pdfSafe = (text: string) => {
        const map: Record<string, string> = {
          'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ş': 's', 'Ş': 'S',
          'ç': 'c', 'Ç': 'C', 'ö': 'o', 'Ö': 'O', 'ü': 'u', 'Ü': 'U',
          'ä': 'a', 'Ä': 'A', 'ß': 'ss', 'ñ': 'n', 'Ñ': 'N',
          'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
          'à': 'a', 'è': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u',
          'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
        };
        return text.replace(/[^\x20-\x7E]/g, (ch) => map[ch] ?? '');
      };

      // --- Company Header ---
      if (tenantName) {
        const safeName = pdfSafe(tenantName);
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(80);
        pdf.text(safeName, margin, y + 4);
        y += 8;
      }

      // --- Title ---
      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0);
      pdf.text("Performance Analysis Report", margin, y + 6);
      y += 10;
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(120);
      pdf.text(`${YEARS[0]}–${YEARS[3]} · Generated ${formatDisplayDate(new Date(), defaultCurrency)}`, margin, y + 4);
      pdf.setTextColor(0);
      y += 12;

      pdf.setDrawColor(200);
      pdf.setLineWidth(0.3);
      pdf.line(margin, y, margin + contentW, y);
      y += 6;

      // --- KPI Summary ---
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text("Key Performance Indicators (Current Year)", margin, y);
      y += 7;

      const kpiItems = [
        { label: "Revenue", value: current ? fmt(current.revenue) : "—" },
        { label: "Net Income", value: current ? fmt(current.netIncome) : "—" },
        { label: "Net Profit Margin", value: current ? `${current.netProfitMargin.toFixed(1)}%` : "—" },
        { label: "Quick Ratio", value: current?.quickRatio != null ? current.quickRatio.toFixed(2) : "—" },
        { label: "Expense Ratio", value: current ? `${current.expenseRatio.toFixed(1)}%` : "—" },
        { label: "Monthly Burn Rate", value: current ? fmt(current.monthlyAvgExpenses) : "—" },
      ];

      const kpiColW = contentW / 3;
      pdf.setFontSize(9);
      kpiItems.forEach((kpi, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = margin + col * kpiColW;
        const yy = y + row * 12;
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100);
        pdf.text(kpi.label, x, yy);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(0);
        pdf.text(kpi.value, x, yy + 5);
      });
      y += Math.ceil(kpiItems.length / 3) * 12 + 6;

      // --- Capture charts ---
      if (chartsRef.current) {
        const tabContents = chartsRef.current.querySelectorAll('[data-state]');
        const originalStates: { el: Element; state: string | null }[] = [];
        tabContents.forEach((el) => {
          originalStates.push({ el, state: el.getAttribute('data-state') });
          if (el.getAttribute('data-state') === 'inactive') {
            el.setAttribute('data-state', 'active');
            (el as HTMLElement).style.display = '';
          }
        });

        const overviewSection = chartsRef.current.querySelector('[data-pdf="overview"]');
        if (overviewSection) {
          const canvas = await html2canvas(overviewSection as HTMLElement, {
            scale: 2,
            backgroundColor: "#ffffff",
            useCORS: true,
            logging: false,
          });
          const imgData = canvas.toDataURL("image/png");
          const imgH = (canvas.height / canvas.width) * contentW;

          if (y + imgH + 10 > pdf.internal.pageSize.getHeight() - margin) {
            pdf.addPage();
            y = margin;
          }
          pdf.setFontSize(12);
          pdf.setFont("helvetica", "bold");
          pdf.text("Charts Overview", margin, y);
          y += 6;
          pdf.addImage(imgData, "PNG", margin, y, contentW, imgH);
          y += imgH + 8;
        }

        originalStates.forEach(({ el, state }) => {
          if (state) el.setAttribute('data-state', state);
        });
      }

      // --- Detailed Table ---
      if (y + 60 > pdf.internal.pageSize.getHeight() - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text("Detailed Year-by-Year Comparison", margin, y);
      y += 7;

      const cols = ["Metric", ...YEARS.map(String), "CAGR"];
      const colWidths = [50, ...YEARS.map(() => 28), 22];
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setFillColor(240, 240, 245);
      pdf.rect(margin, y - 1, contentW, 7, "F");
      cols.forEach((col, i) => {
        const x = margin + colWidths.slice(0, i).reduce((s, w) => s + w, 0);
        pdf.text(col, i === 0 ? x + 1 : x + colWidths[i] - 1, y + 4, i === 0 ? {} : { align: "right" });
      });
      y += 8;

      pdf.setFont("helvetica", "normal");
      metricRows.forEach((row, ri) => {
        if (y + 7 > pdf.internal.pageSize.getHeight() - margin) {
          pdf.addPage();
          y = margin;
        }
        if (ri % 2 === 0) {
          pdf.setFillColor(248, 248, 252);
          pdf.rect(margin, y - 1, contentW, 6, "F");
        }
        pdf.setTextColor(40);
        pdf.text(row.label, margin + 1, y + 3.5);
        YEARS.forEach((yr, yi) => {
          const d = yearlyData.find((yd) => yd.year === yr);
          const val = d ? (d as any)[row.key] : null;
          const x = margin + colWidths.slice(0, yi + 1).reduce((s, w) => s + w, 0) + colWidths[yi + 1] - 1;
          pdf.text(row.format(val), x, y + 3.5, { align: "right" });
        });
        const cagrX = margin + contentW - 1;
        let cagrVal = "—";
        if (row.key === "revenue" && cagr.revenue !== null) cagrVal = `${cagr.revenue.toFixed(1)}%`;
        if (row.key === "expenses" && cagr.expenses !== null) cagrVal = `${cagr.expenses.toFixed(1)}%`;
        if (row.key === "netIncome" && cagr.netIncome !== null) cagrVal = `${cagr.netIncome.toFixed(1)}%`;
        pdf.setTextColor(0, 130, 120);
        pdf.text(cagrVal, cagrX, y + 3.5, { align: "right" });
        pdf.setTextColor(0);
        y += 6;
      });
      y += 6;

      // --- Financial Ratios as Table ---
      const ratioTableH = 8 + ratioCards.length * 6 + 2;
      if (y + ratioTableH > pdf.internal.pageSize.getHeight() - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0);
      pdf.text("Financial Ratios Summary", margin, y);
      y += 8;

      const ratioCols = ["Ratio", ...YEARS.map(String)];
      const ratioColWidths = [52, ...YEARS.map(() => 32)];
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setFillColor(235, 238, 245);
      pdf.rect(margin, y - 1, contentW, 7, "F");
      ratioCols.forEach((col, i) => {
        const x = margin + ratioColWidths.slice(0, i).reduce((s, w) => s + w, 0);
        pdf.setTextColor(60);
        pdf.text(col, i === 0 ? x + 2 : x + ratioColWidths[i] - 2, y + 4, i === 0 ? {} : { align: "right" });
      });
      y += 8;

      ratioCards.forEach((rc, ri) => {
        if (y + 7 > pdf.internal.pageSize.getHeight() - margin) {
          pdf.addPage();
          y = margin;
        }
        if (ri % 2 === 0) {
          pdf.setFillColor(248, 248, 252);
          pdf.rect(margin, y - 1, contentW, 6, "F");
        }
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(40);
        pdf.text(rc.title, margin + 2, y + 3.5);
        rc.values.forEach((v, vi) => {
          const x = margin + ratioColWidths.slice(0, vi + 1).reduce((s, w) => s + w, 0) + ratioColWidths[vi + 1] - 2;
          const formatted = rc.format(v.value as any);
          pdf.setTextColor(60);
          pdf.text(formatted, x, y + 3.5, { align: "right" });
        });
        y += 6;
      });

      y += 3;
      pdf.setFontSize(6.5);
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(140);
      ratioCards.forEach((rc) => {
        pdf.text(`${rc.title}: ${rc.description}`, margin + 2, y + 2.5);
        y += 3.5;
      });
      y += 4;

      // --- Footer ---
      const safeFooterName = pdfSafe(tenantName || "LedgerPilot");
      const totalPages = pdf.getNumberOfPages();
      const pageH = pdf.internal.pageSize.getHeight();
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(180, 40, 40);
        pdf.text("CONFIDENTIAL — CLASSIFIED INFORMATION", pageW / 2, pageH - 10, { align: "center" });
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(160);
        pdf.text(
          `${safeFooterName} · Performance Analysis · Page ${p} of ${totalPages}`,
          pageW / 2,
          pageH - 6,
          { align: "center" }
        );
      }

      pdf.save(`Performance_Analysis_${YEARS[0]}-${YEARS[3]}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Performance Analysis</h1>
          <p className="text-sm text-muted-foreground">
            {YEARS[0]}–{YEARS[3]} · Posted entries only
          </p>
        </div>
        <Button onClick={handleExportPDF} disabled={exporting || isLoading} variant="outline" size="sm">
          {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          {exporting ? "Exporting…" : "Export PDF"}
        </Button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Revenue</p>
              <DollarSign className="h-4 w-4 text-success" />
            </div>
            <p className="mt-1 text-xl font-bold text-foreground">{current ? fmt(current.revenue) : "—"}</p>
            <YoYBadge current={current?.revenue} previous={previous?.revenue} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Net Income</p>
              <TrendingUp className="h-4 w-4 text-accent" />
            </div>
            <p className="mt-1 text-xl font-bold text-foreground">{current ? fmt(current.netIncome) : "—"}</p>
            <YoYBadge current={current?.netIncome} previous={previous?.netIncome} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Net Profit Margin</p>
              <Percent className="h-4 w-4 text-info" />
            </div>
            <p className="mt-1 text-xl font-bold text-foreground">
              {current ? `${current.netProfitMargin.toFixed(1)}%` : "—"}
            </p>
            <YoYBadge current={current?.netProfitMargin} previous={previous?.netProfitMargin} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Quick Ratio</p>
              <Shield className="h-4 w-4 text-warning" />
            </div>
            <p className="mt-1 text-xl font-bold text-foreground">
              {current?.quickRatio !== null && current?.quickRatio !== undefined
                ? current.quickRatio.toFixed(2)
                : "—"}
            </p>
            {current?.quickRatio !== null && current?.quickRatio !== undefined && (
              <Badge
                variant="outline"
                className={`text-[10px] ${current.quickRatio >= 1 ? "text-success border-success/30" : "text-destructive border-destructive/30"}`}
              >
                {current.quickRatio >= 1 ? "Healthy" : "Below 1.0"}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div ref={chartsRef}>
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Drill-Down</TabsTrigger>
          <TabsTrigger value="table">Detailed Table</TabsTrigger>
          <TabsTrigger value="ratios">Financial Ratios</TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview Charts */}
        <TabsContent value="overview" className="space-y-6">
          <div data-pdf="overview" className="grid gap-6 lg:grid-cols-2">
            {/* Revenue vs Expenses */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Revenue vs Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(v: number) => [fmt(v)]}
                    />
                    <Legend />
                    <Bar dataKey="Revenue" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Net Income Trend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Net Income Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(v: number) => [fmt(v)]}
                    />
                    <Line type="monotone" dataKey="Net Income" stroke="hsl(var(--accent))" strokeWidth={2.5} dot={{ r: 5, fill: "hsl(var(--accent))" }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Margins & Ratios Trend */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Margins & Ratios Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(v: number) => [`${v.toFixed(1)}%`]}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="Net Profit Margin" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Expense Ratio" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Monthly Drill-Down */}
        <TabsContent value="monthly" className="space-y-6">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-muted-foreground">Select Year:</p>
            <Select value={drillYear.toString()} onValueChange={(v) => setDrillYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadingMonthly ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : (
            <>
              {/* Monthly summary cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">Total Revenue ({drillYear})</p>
                    <p className="mt-1 text-lg font-bold text-foreground">{fmt(monthlyTotals.revenue)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">Total Expenses ({drillYear})</p>
                    <p className="mt-1 text-lg font-bold text-foreground">{fmt(monthlyTotals.expenses)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">Net Income ({drillYear})</p>
                    <p className={`mt-1 text-lg font-bold ${monthlyTotals.netIncome >= 0 ? "text-success" : "text-destructive"}`}>
                      {fmt(monthlyTotals.netIncome)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Monthly Revenue vs Expenses chart */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Revenue vs Expenses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={monthlyData} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                          formatter={(v: number) => [fmt(v)]}
                        />
                        <Legend />
                        <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Net Income area chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Net Income</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                          formatter={(v: number) => [fmt(v)]}
                        />
                        <Area type="monotone" dataKey="netIncome" name="Net Income" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.15)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Monthly data table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Breakdown — {drillYear}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Expenses</TableHead>
                          <TableHead className="text-right">Net Income</TableHead>
                          <TableHead className="text-right">Margin %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlyData.map((m) => (
                          <TableRow key={m.month}>
                            <TableCell className="font-medium text-foreground">{m.month}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmt(m.revenue)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmt(m.expenses)}</TableCell>
                            <TableCell className={`text-right font-mono text-sm font-semibold ${m.netIncome >= 0 ? "text-success" : "text-destructive"}`}>
                              {fmt(m.netIncome)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">{m.margin.toFixed(1)}%</TableCell>
                          </TableRow>
                        ))}
                        {/* Totals row */}
                        <TableRow className="bg-muted/40 font-semibold">
                          <TableCell className="font-bold text-foreground">Total</TableCell>
                          <TableCell className="text-right font-mono text-sm font-bold">{fmt(monthlyTotals.revenue)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-bold">{fmt(monthlyTotals.expenses)}</TableCell>
                          <TableCell className={`text-right font-mono text-sm font-bold ${monthlyTotals.netIncome >= 0 ? "text-success" : "text-destructive"}`}>
                            {fmt(monthlyTotals.netIncome)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-bold">
                            {monthlyTotals.revenue !== 0 ? ((monthlyTotals.netIncome / monthlyTotals.revenue) * 100).toFixed(1) : "0.0"}%
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Tab 3: Detailed Table */}
        <TabsContent value="table">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Metric</TableHead>
                      {YEARS.map((y) => (
                        <TableHead key={y} className="text-right min-w-[120px]">{y}</TableHead>
                      ))}
                      <TableHead className="text-right min-w-[80px]">CAGR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metricRows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium text-foreground">{row.label}</TableCell>
                        {YEARS.map((y) => {
                          const d = yearlyData.find((yd) => yd.year === y);
                          const val = d ? (d as any)[row.key] : null;
                          return (
                            <TableCell key={y} className="text-right font-mono text-sm">
                              {row.format(val)}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right font-mono text-sm text-accent">
                          {row.key === "revenue" && cagr.revenue !== null ? `${cagr.revenue.toFixed(1)}%` : ""}
                          {row.key === "expenses" && cagr.expenses !== null ? `${cagr.expenses.toFixed(1)}%` : ""}
                          {row.key === "netIncome" && cagr.netIncome !== null ? `${cagr.netIncome.toFixed(1)}%` : ""}
                          {!["revenue", "expenses", "netIncome"].includes(row.key) ? "—" : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Financial Ratios */}
        <TabsContent value="ratios" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ratioCards.map((rc) => {
              const latestVal = rc.values[rc.values.length - 1]?.value;
              const sparkData = rc.values.map((v) => ({ year: v.year.toString(), value: v.value ?? 0 }));
              return (
                <Card key={rc.title}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{rc.title}</p>
                        <p className="text-[11px] text-muted-foreground">{rc.description}</p>
                      </div>
                      <rc.icon className="h-5 w-5 text-muted-foreground" />
                    </div>

                    <p className={`text-2xl font-bold mb-2 ${rc.good(latestVal) ? "text-success" : "text-destructive"}`}>
                      {rc.format(latestVal as any)}
                    </p>

                    {/* Sparkline */}
                    <ResponsiveContainer width="100%" height={60}>
                      <LineChart data={sparkData}>
                        <XAxis dataKey="year" hide />
                        <YAxis hide domain={["auto", "auto"]} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
                          formatter={(v: number) => [rc.format(v as any)]}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke={rc.good(latestVal) ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>

                    {/* Year breakdown */}
                    <div className="flex justify-between mt-2 text-[11px] text-muted-foreground">
                      {rc.values.map((v) => (
                        <span key={v.year}>{v.year}: {rc.format(v.value as any)}</span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};

export default PerformanceAnalysis;
