import { useState, useMemo } from "react";
import { format, startOfYear, subDays } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";
import { AlertTriangle, TrendingUp, DollarSign, Clock, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { formatCurrency as fmtCurrency, formatDisplayDate } from "@/lib/utils";

const CashFlow = () => {
  const { tenantId, defaultCurrency, accountingBasis } = useTenant();
  const isCashBasis = accountingBasis === "cash";
  const formatCurrency = (val: number) => fmtCurrency(val, defaultCurrency, { minimumFractionDigits: 0 });
  const [startDate, setStartDate] = useState<Date | undefined>(startOfYear(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());

  const startStr = startDate ? format(startDate, "yyyy-MM-dd") : undefined;
  const endStr = endDate ? format(endDate, "yyyy-MM-dd") : undefined;

  // Fetch chart of accounts
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

  // Helper: collect a parent and all descendants
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

  const cashAccountIds = collectDescendantIds("1000", "asset");
  const apAccountIds = collectDescendantIds("2000", "liability");

  // AR account IDs (1100 and descendants)
  const arAccountIds = useMemo(() => {
    const ar = coaAccounts.find(a => a.code === "1100" && a.account_type === "asset");
    if (!ar) return [];
    return [ar.id, ...coaAccounts.filter(a => a.parent_id === ar.id).map(a => a.id)];
  }, [coaAccounts]);

  // Deferred Revenue account IDs (2200 and descendants)
  const deferredRevAccountIds = useMemo(() => {
    const dr = coaAccounts.find(a => a.code === "2200" && a.account_type === "liability");
    if (!dr) return [];
    return [dr.id, ...coaAccounts.filter(a => a.parent_id === dr.id).map(a => a.id)];
  }, [coaAccounts]);

  // Sales Tax Payable account IDs (2500 and descendants)
  const taxPayableAccountIds = useMemo(() => {
    const tax = coaAccounts.find(a => a.code === "2500" && a.account_type === "liability");
    if (!tax) return [];
    return [tax.id, ...coaAccounts.filter(a => a.parent_id === tax.id).map(a => a.id)];
  }, [coaAccounts]);

  // Revenue & Expense account IDs for computing Net Income (accrual mode)
  const revenueAccountIds = useMemo(
    () => coaAccounts.filter(a => a.account_type === "revenue").map(a => a.id),
    [coaAccounts]
  );
  const expenseAccountIds = useMemo(
    () => coaAccounts.filter(a => a.account_type === "expense").map(a => a.id),
    [coaAccounts]
  );

  // Compute total cash balance from journal lines on cash accounts (all time)
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

  // Compute opening cash balance = sum of all cash journal lines BEFORE the start date
  const { data: openingCashBalance = 0 } = useQuery({
    queryKey: ["cf-opening-cash", tenantId, cashAccountIds, startStr],
    enabled: !!tenantId && cashAccountIds.length > 0 && !!startStr,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_lines")
        .select("debit, credit, journal_entries!inner(entry_date)")
        .eq("tenant_id", tenantId!)
        .in("account_id", cashAccountIds)
        .is("deleted_at", null)
        .lt("journal_entries.entry_date", startStr!);
      return data?.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0) ?? 0;
    },
  });

  // Compute AP balance
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

  // Fetch historical cash account journal lines with dates + details
  const { data: cashJournalLines = [] } = useQuery({
    queryKey: ["cf-cash-lines", tenantId, cashAccountIds, startStr, endStr],
    enabled: !!tenantId && cashAccountIds.length > 0,
    queryFn: async () => {
      let query = supabase
        .from("journal_lines")
        .select("debit, credit, description, account_id, journal_entry_id, journal_entries!inner(entry_date, description, entry_number), chart_of_accounts!inner(name)")
        .eq("tenant_id", tenantId!)
        .in("account_id", cashAccountIds)
        .is("deleted_at", null);
      if (startStr) query = query.gte("journal_entries.entry_date", startStr);
      if (endStr) query = query.lte("journal_entries.entry_date", endStr);
      const { data } = await query;
      return (data ?? []) as Array<{
        debit: number; credit: number; description: string | null; account_id: string;
        journal_entries: { entry_date: string; description: string; entry_number: string };
        chart_of_accounts: { name: string };
      }>;
    },
  });

  // Accrual mode: fetch all posted journal lines in date range for Net Income + adjustments
  const { data: allPeriodLines = [] } = useQuery({
    queryKey: ["cf-all-period-lines", tenantId, startStr, endStr],
    enabled: !!tenantId && !isCashBasis,
    queryFn: async () => {
      let entryQuery = supabase
        .from("journal_entries")
        .select("id")
        .eq("tenant_id", tenantId!)
        .eq("status", "posted")
        .is("deleted_at", null);
      if (startStr) entryQuery = entryQuery.gte("entry_date", startStr);
      if (endStr) entryQuery = entryQuery.lte("entry_date", endStr);
      const { data: entries } = await entryQuery;
      if (!entries || entries.length === 0) return [];
      const entryIds = entries.map(e => e.id);
      const { data } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("journal_entry_id", entryIds);
      return data ?? [];
    },
  });

  // Accrual-mode computed values
  const accrualNetIncome = useMemo(() => {
    if (isCashBasis) return 0;
    const revSet = new Set(revenueAccountIds);
    const expSet = new Set(expenseAccountIds);
    let revenue = 0;
    let expenses = 0;
    for (const l of allPeriodLines) {
      if (revSet.has(l.account_id)) revenue += Number(l.credit) - Number(l.debit);
      if (expSet.has(l.account_id)) expenses += Number(l.debit) - Number(l.credit);
    }
    return revenue - expenses;
  }, [isCashBasis, allPeriodLines, revenueAccountIds, expenseAccountIds]);

  const accrualARChange = useMemo(() => {
    if (isCashBasis) return 0;
    const arSet = new Set(arAccountIds);
    // Change in AR = net debit increase (debit-normal account)
    return allPeriodLines.filter(l => arSet.has(l.account_id))
      .reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
  }, [isCashBasis, allPeriodLines, arAccountIds]);

  const accrualDeferredRevChange = useMemo(() => {
    if (isCashBasis) return 0;
    const drSet = new Set(deferredRevAccountIds);
    // Change in Deferred Revenue = net credit increase (credit-normal)
    return allPeriodLines.filter(l => drSet.has(l.account_id))
      .reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0);
  }, [isCashBasis, allPeriodLines, deferredRevAccountIds]);

  const accrualTaxPayableChange = useMemo(() => {
    if (isCashBasis) return 0;
    const taxSet = new Set(taxPayableAccountIds);
    // Change in Sales Tax Payable = net credit increase (credit-normal)
    return allPeriodLines.filter(l => taxSet.has(l.account_id))
      .reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0);
  }, [isCashBasis, allPeriodLines, taxPayableAccountIds]);

  // Monthly outflows from bills
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

  const { data: recurringSeedEntries = [] } = useQuery({
    queryKey: ["cf-recurring-seeds", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("entry_date, description")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null);
      return data ?? [];
    },
  });

  // Hide orphaned recurring forecasts whose source journal entry has been deleted
  const visibleForecasts = useMemo(() => {
    const toKey = (date: string, description: string) => `${date}::${description.trim().toLowerCase()}`;
    const liveRecurringSeedKeys = new Set(
      recurringSeedEntries.map((entry) => toKey(entry.entry_date, entry.description))
    );

    return forecasts.filter((forecast) => {
      if (!forecast.is_recurring) return true;
      return liveRecurringSeedKeys.has(toKey(forecast.forecast_date, forecast.description));
    });
  }, [forecasts, recurringSeedEntries]);

  const now = new Date();
  const parseLocalDate = (value: string) => new Date(value + (value.length === 10 ? "T00:00:00" : ""));
  const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const shouldApplyMonthlyRecurringForecast = (forecastDate: string, targetMonthStart: Date) => {
    const forecastStartMonth = monthStart(parseLocalDate(forecastDate));
    const currentEvalMonth = monthStart(targetMonthStart);
    return currentEvalMonth.getTime() > forecastStartMonth.getTime();
  };
  const currentMonthStr = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
  const { data: futureCashJournalLines = [] } = useQuery({
    queryKey: ["cf-future-je-lines", tenantId, cashAccountIds, currentMonthStr, endStr],
    enabled: !!tenantId && cashAccountIds.length > 0,
    queryFn: async () => {
      let query = supabase
        .from("journal_lines")
        .select("debit, credit, description, account_id, journal_entry_id, journal_entries!inner(entry_date, description, entry_number), chart_of_accounts!inner(name)")
        .eq("tenant_id", tenantId!)
        .in("account_id", cashAccountIds)
        .is("deleted_at", null)
        .gte("journal_entries.entry_date", currentMonthStr);
      if (endStr) query = query.lte("journal_entries.entry_date", endStr);
      const { data } = await query;
      return (data ?? []) as Array<{
        debit: number; credit: number; description: string | null; account_id: string;
        journal_entries: { entry_date: string; description: string; entry_number: string };
        chart_of_accounts: { name: string };
      }>;
    },
  });

  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  // Outstanding invoices
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

  // Outstanding bills
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

  // For accrual mode: Net Cash from Operations = Net Income - ΔAR + ΔDeferred Revenue + ΔSales Tax Payable
  const accrualNetCashFromOps = accrualNetIncome - accrualARChange + accrualDeferredRevChange + accrualTaxPayableChange;

  // Build monthly chart
  const chartData = (() => {
    const rangeStart = startDate ?? new Date();
    const rangeEnd = endDate ?? new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 12, 0);
    const firstMonth = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    const lastMonth = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

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

    const result: { month: string; inflow: number; outflow: number; balance: number; start?: Date; end?: Date; isPast?: boolean }[] = [
      { month: "Opening", inflow: 0, outflow: 0, balance: openingCashBalance },
    ];

    let running = openingCashBalance;
    months.forEach((m) => {
      let inflow = 0;
      let outflow = 0;
      const isPast = m.start < currentMonthStart;

      if (isPast) {
        cashJournalLines.forEach((line) => {
          const entryDate = new Date(line.journal_entries.entry_date);
          if (entryDate >= m.start && entryDate <= m.end) {
            inflow += Number(line.debit);
            outflow += Number(line.credit);
          }
        });
      } else {
        if (!isCashBasis) {
          // Accrual: project based on AR/AP
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
        }

        visibleForecasts.forEach((f) => {
          const fd = parseLocalDate(f.forecast_date);
          const amt = Math.abs(Number(f.amount) || 0);
          const applyForecast = () => {
            if (f.category === "expense") outflow += amt;
            else inflow += amt;
          };

          if (f.is_recurring && f.recurrence_interval === "monthly") {
            if (shouldApplyMonthlyRecurringForecast(f.forecast_date, m.start)) {
              applyForecast();
            }
          } else {
            if (fd >= m.start && fd <= m.end) applyForecast();
          }
        });

        futureCashJournalLines.forEach((line) => {
          const entryDate = new Date(line.journal_entries.entry_date);
          if (entryDate >= m.start && entryDate <= m.end) {
            inflow += Number(line.debit);
            outflow += Number(line.credit);
          }
        });
      }

      running += inflow - outflow;
      result.push({ month: m.month, inflow, outflow, balance: running, start: m.start, end: m.end, isPast });
    });

    return result;
  })();

  // Build detail items for the expanded month
  const expandedDetails = useMemo(() => {
    if (expandedMonth === null || expandedMonth < 0 || expandedMonth >= chartData.length) return [];
    const row = chartData[expandedMonth];
    if (!row.start || !row.end) return []; // "Opening" row

    const items: { date: string; description: string; account: string; type: "inflow" | "outflow"; amount: number; source: string }[] = [];
    const mStart = row.start;
    const mEnd = row.end;
    const currentMonthStart2 = new Date(now.getFullYear(), now.getMonth(), 1);
    const isPast = mStart < currentMonthStart2;

    if (isPast) {
      // Historical: show actual cash journal lines
      cashJournalLines.forEach((line) => {
        const entryDate = new Date(line.journal_entries.entry_date);
        if (entryDate >= mStart && entryDate <= mEnd) {
          const debit = Number(line.debit);
          const credit = Number(line.credit);
          if (debit > 0) {
            items.push({
              date: line.journal_entries.entry_date,
              description: line.description || line.journal_entries.description,
              account: line.chart_of_accounts.name,
              type: "inflow",
              amount: debit,
              source: `JE ${line.journal_entries.entry_number}`,
            });
          }
          if (credit > 0) {
            items.push({
              date: line.journal_entries.entry_date,
              description: line.description || line.journal_entries.description,
              account: line.chart_of_accounts.name,
              type: "outflow",
              amount: credit,
              source: `JE ${line.journal_entries.entry_number}`,
            });
          }
        }
      });
    } else {
      // Future: show projected items
      if (!isCashBasis) {
        outstandingInvoices.forEach((inv) => {
          const due = new Date(inv.due_date);
          if (due >= mStart && due <= mEnd) {
            const outstanding = Number(inv.total_amount) - Number(inv.amount_paid);
            if (outstanding > 0) {
              items.push({
                date: inv.due_date,
                description: `Invoice payment expected`,
                account: "Accounts Receivable",
                type: "inflow",
                amount: outstanding,
                source: `Invoice (${inv.status})`,
              });
            }
          }
        });

        outstandingBills.forEach((bill) => {
          const due = new Date(bill.due_date);
          if (due >= mStart && due <= mEnd) {
            const outstanding = Number(bill.total_amount) - Number(bill.amount_paid);
            if (outstanding > 0) {
              items.push({
                date: bill.due_date,
                description: `Bill payment due`,
                account: "Accounts Payable",
                type: "outflow",
                amount: outstanding,
                source: `Bill (${bill.status})`,
              });
            }
          }
        });
      }

      visibleForecasts.forEach((f) => {
        const fd = parseLocalDate(f.forecast_date);
        const amt = Math.abs(Number(f.amount) || 0);
        let applies = false;
        if (f.is_recurring && f.recurrence_interval === "monthly") {
          applies = shouldApplyMonthlyRecurringForecast(f.forecast_date, mStart);
        } else {
          applies = fd >= mStart && fd <= mEnd;
        }
        if (applies && amt > 0) {
          items.push({
            date: f.forecast_date,
            description: f.description,
            account: f.category ?? "Forecast",
            type: f.category === "expense" ? "outflow" : "inflow",
            amount: amt,
            source: f.is_recurring ? "Recurring forecast" : "Forecast",
          });
        }
      });

      futureCashJournalLines.forEach((line) => {
        const entryDate = new Date(line.journal_entries.entry_date);
        if (entryDate >= mStart && entryDate <= mEnd) {
          const debit = Number(line.debit);
          const credit = Number(line.credit);
          if (debit > 0) {
            items.push({
              date: line.journal_entries.entry_date,
              description: line.description || line.journal_entries.description,
              account: line.chart_of_accounts.name,
              type: "inflow",
              amount: debit,
              source: `JE ${line.journal_entries.entry_number}`,
            });
          }
          if (credit > 0) {
            items.push({
              date: line.journal_entries.entry_date,
              description: line.description || line.journal_entries.description,
              account: line.chart_of_accounts.name,
              type: "outflow",
              amount: credit,
              source: `JE ${line.journal_entries.entry_number}`,
            });
          }
        }
      });
    }

    // Sort by date
    items.sort((a, b) => a.date.localeCompare(b.date));
    return items;
  }, [expandedMonth, chartData, cashJournalLines, futureCashJournalLines, outstandingInvoices, outstandingBills, visibleForecasts, isCashBasis, now]);

  const metrics = isCashBasis
    ? [
        { label: "Burn Rate (Period)", value: formatCurrency(monthlyBurn), icon: TrendingUp },
        { label: "Runway", value: runway !== null ? `${runway.toFixed(1)} months` : "N/A", icon: Clock },
        { label: "Cash Balance", value: formatCurrency(cashBalance), icon: DollarSign },
        { label: "Net Cash Position", value: formatCurrency(netCashPosition), icon: DollarSign },
      ]
    : [
        { label: "Net Income (Accrual)", value: formatCurrency(accrualNetIncome), icon: TrendingUp },
        { label: "ΔAR (Working Capital)", value: formatCurrency(accrualARChange), icon: Clock },
        { label: "ΔDeferred Revenue", value: formatCurrency(accrualDeferredRevChange), icon: DollarSign },
        { label: "Net Cash from Ops", value: formatCurrency(accrualNetCashFromOps), icon: DollarSign },
      ];

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cash Flow</h1>
          <p className="text-sm text-muted-foreground">
            {isCashBasis ? "Direct cash movements" : "Indirect method — starts from Net Income"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">
            {isCashBasis ? "Cash Basis" : "Accrual Basis (Indirect)"}
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

      {/* Accrual mode: Indirect method reconciliation */}
      {!isCashBasis && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cash from Operations — Indirect Method</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 text-foreground">Net Income</td>
                  <td className="py-2.5 text-right font-mono font-semibold text-foreground">
                    {formatCurrency(accrualNetIncome)}
                  </td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 text-muted-foreground pl-4">
                    Less: Increase in Accounts Receivable
                  </td>
                  <td className={`py-2.5 text-right font-mono ${accrualARChange > 0 ? "text-destructive" : "text-success"}`}>
                    {accrualARChange > 0 ? "(" : ""}{formatCurrency(Math.abs(accrualARChange))}{accrualARChange > 0 ? ")" : ""}
                  </td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 text-muted-foreground pl-4">
                    Add: Increase in Deferred Revenue
                  </td>
                  <td className={`py-2.5 text-right font-mono ${accrualDeferredRevChange >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(accrualDeferredRevChange)}
                  </td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 text-muted-foreground pl-4">
                    Add: Increase in Sales Tax Payable
                  </td>
                  <td className={`py-2.5 text-right font-mono ${accrualTaxPayableChange >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(accrualTaxPayableChange)}
                  </td>
                </tr>
                <tr className="border-t-2 border-border">
                  <td className="py-2.5 font-semibold text-foreground">Net Cash from Operations</td>
                  <td className={`py-2.5 text-right font-mono font-bold ${accrualNetCashFromOps >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(accrualNetCashFromOps)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cash Flow Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[360px] w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis yAxisId="left" domain={['dataMin', 'dataMax']} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" domain={['dataMin', 'dataMax']} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name === "balance" ? "Cash Balance" : name === "inflow" ? "Inflows" : "Outflows"]}
                />
                <Bar yAxisId="right" dataKey="balance" fill="hsl(var(--accent) / 0.25)" stroke="hsl(var(--accent))" strokeWidth={1} name="balance" radius={[4, 4, 0, 0]} />
                <Area yAxisId="left" type="monotone" dataKey="inflow" stroke="hsl(142 71% 45%)" fill="hsl(142 71% 45% / 0.1)" strokeWidth={2} name="inflow" />
                <Area yAxisId="left" type="monotone" dataKey="outflow" stroke="hsl(0 84% 60%)" fill="hsl(0 84% 60% / 0.1)" strokeWidth={2} name="outflow" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-2.5 w-5 rounded-sm" style={{ backgroundColor: "hsl(142 71% 45%)" }} />
              Inflows
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-2.5 w-5 rounded-sm" style={{ backgroundColor: "hsl(0 84% 60%)" }} />
              Expenses
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-2.5 w-5 rounded-sm border" style={{ backgroundColor: "hsl(var(--accent) / 0.25)", borderColor: "hsl(var(--accent))" }} />
              Net Cash (right axis)
            </span>
          </div>
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
                  const isOpen = row.month === "Opening";
                  const isExpanded = expandedMonth === i;
                  const hasActivity = row.inflow > 0 || row.outflow > 0;
                  return (
                    <>
                      <tr
                        key={i}
                        className={`border-b border-border/50 transition-colors ${!isOpen && hasActivity ? "cursor-pointer hover:bg-muted/50" : "hover:bg-muted/30"} ${isExpanded ? "bg-muted/50" : ""}`}
                        onClick={() => {
                          if (!isOpen && hasActivity) setExpandedMonth(isExpanded ? null : i);
                        }}
                      >
                        <td className="py-2.5 font-medium text-foreground flex items-center gap-1.5">
                          {!isOpen && hasActivity ? (
                            isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <span className="inline-block w-3.5" />
                          )}
                          {row.month}
                        </td>
                        <td className="py-2.5 text-right font-mono text-green-600">{formatCurrency(row.inflow)}</td>
                        <td className="py-2.5 text-right font-mono text-destructive">{formatCurrency(row.outflow)}</td>
                        <td className={`py-2.5 text-right font-mono ${net < 0 ? "text-destructive" : "text-foreground"}`}>
                          {net < 0 ? `(${formatCurrency(Math.abs(net))})` : formatCurrency(net)}
                        </td>
                        <td className={`py-2.5 text-right font-mono font-medium ${row.balance < 0 ? "text-destructive" : "text-foreground"}`}>
                          {row.balance < 0 ? `(${formatCurrency(Math.abs(row.balance))})` : formatCurrency(row.balance)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${i}-detail`}>
                          <td colSpan={5} className="p-0">
                            <div className="bg-muted/30 border-b border-border px-4 py-3">
                              {expandedDetails.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">No detailed items for this month.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-border/50">
                                      <th className="pb-1.5 text-left font-medium text-muted-foreground">Date</th>
                                      <th className="pb-1.5 text-left font-medium text-muted-foreground">Description</th>
                                      <th className="pb-1.5 text-left font-medium text-muted-foreground">Account</th>
                                      <th className="pb-1.5 text-left font-medium text-muted-foreground">Source</th>
                                      <th className="pb-1.5 text-right font-medium text-muted-foreground">Inflow</th>
                                      <th className="pb-1.5 text-right font-medium text-muted-foreground">Outflow</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedDetails.map((item, j) => (
                                      <tr key={j} className="border-b border-border/20">
                                        <td className="py-1.5 text-foreground">{formatDisplayDate(item.date, defaultCurrency)}</td>
                                        <td className="py-1.5 text-foreground max-w-[200px] truncate">{item.description}</td>
                                        <td className="py-1.5 text-muted-foreground">{item.account}</td>
                                        <td className="py-1.5 text-muted-foreground">{item.source}</td>
                                        <td className="py-1.5 text-right font-mono text-green-600">
                                          {item.type === "inflow" ? formatCurrency(item.amount) : ""}
                                        </td>
                                        <td className="py-1.5 text-right font-mono text-destructive">
                                          {item.type === "outflow" ? formatCurrency(item.amount) : ""}
                                        </td>
                                      </tr>
                                    ))}
                                    <tr className="border-t border-border bg-muted/40">
                                      <td colSpan={4} className="py-1.5 font-semibold text-foreground">Totals</td>
                                      <td className="py-1.5 text-right font-mono font-semibold text-green-600">
                                        {formatCurrency(expandedDetails.filter(d => d.type === "inflow").reduce((s, d) => s + d.amount, 0))}
                                      </td>
                                      <td className="py-1.5 text-right font-mono font-semibold text-destructive">
                                        {formatCurrency(expandedDetails.filter(d => d.type === "outflow").reduce((s, d) => s + d.amount, 0))}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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
            {/* Outstanding Invoices (Inflows) — hide in cash mode */}
            {!isCashBasis && (
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
            )}

            {/* Outstanding Bills (Outflows) — hide in cash mode */}
            {!isCashBasis && (
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
            )}

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
