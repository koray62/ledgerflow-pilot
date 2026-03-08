import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

/**
 * Returns a set of closed fiscal year labels (e.g. "2025") and a helper
 * to check whether a given date string falls in a closed fiscal year.
 */
export const useClosedFiscalYears = () => {
  const { tenantId } = useTenant();

  const { data: closedYears = new Set<string>(), isLoading } = useQuery({
    queryKey: ["closed-fiscal-years", tenantId],
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("description")
        .eq("tenant_id", tenantId!)
        .like("description", "Year-End Closing — FY %")
        .is("deleted_at", null);

      const years = new Set<string>();
      for (const row of data ?? []) {
        const match = row.description.match(/Year-End Closing — FY (\d{4})/);
        if (match) years.add(match[1]);
      }
      return years;
    },
  });

  const { data: tenant } = useQuery({
    queryKey: ["tenant-fiscal-end", tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("fiscal_year_end")
        .eq("id", tenantId!)
        .single();
      return data;
    },
  });

  const fiscalYearEnd = tenant?.fiscal_year_end ?? 12;

  /**
   * Given a date string (YYYY-MM-DD), returns the fiscal year label it belongs to.
   * E.g. fiscal_year_end=12: 2025-03-15 → "2025"
   *      fiscal_year_end=3:  2025-03-15 → "2025", 2024-05-01 → "2025"
   */
  const getFiscalYear = (dateStr: string): string => {
    const d = new Date(dateStr);
    const month = d.getMonth() + 1; // 1-12
    const year = d.getFullYear();
    if (fiscalYearEnd === 12) return String(year);
    // If month > fiscal_year_end, it belongs to the next FY
    return month > fiscalYearEnd ? String(year + 1) : String(year);
  };

  /**
   * Returns true if the given date falls in a closed fiscal year.
   */
  const isDateInClosedYear = (dateStr: string): boolean => {
    if (!dateStr || closedYears.size === 0) return false;
    return closedYears.has(getFiscalYear(dateStr));
  };

  return { closedYears, isDateInClosedYear, getFiscalYear, isLoading };
};
