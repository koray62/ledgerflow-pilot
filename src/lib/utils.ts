import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "AED", label: "UAE Dirham", symbol: "د.إ" },
  { code: "TRY", label: "Turkish Lira", symbol: "₺" },
  { code: "SAR", label: "Saudi Riyal", symbol: "ر.س" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

// Map common non-standard codes to valid ISO 4217 codes
const CURRENCY_ALIAS: Record<string, string> = {
  TL: "TRY",
};

export const formatCurrency = (
  amount: number,
  currency: string = "USD",
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number; abs?: boolean }
) => {
  const value = options?.abs ? Math.abs(amount) : amount;
  const code = CURRENCY_ALIAS[currency] ?? currency;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: options?.maximumFractionDigits,
      minimumFractionDigits: options?.minimumFractionDigits,
    }).format(value);
  } catch {
    // Fallback for any unrecognised currency code
    return `${code} ${value.toFixed(2)}`;
  }
};

/**
 * Format a date for display. Uses MM/dd/yyyy for USD, dd-MM-yyyy for all other currencies.
 * Accepts Date objects or ISO date strings.
 */
export const formatDisplayDate = (
  date: Date | string,
  currency: string = "USD",
  style: "full" | "short" | "month" = "full"
): string => {
  const d = typeof date === "string" ? new Date(date + (date.length === 10 ? "T00:00:00" : "")) : date;
  if (isNaN(d.getTime())) return "—";

  const isUS = currency === "USD";

  if (style === "month") {
    // Short style for dashboard: "Mar 5" or "05-03"
    if (isUS) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}-${mm}`;
  }

  if (style === "short") {
    // For compact filter chips: "MM/dd" or "dd-MM"
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return isUS ? `${mm}/${dd}` : `${dd}-${mm}`;
  }

  // Full date
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return isUS ? `${mm}/${dd}/${yyyy}` : `${dd}-${mm}-${yyyy}`;
};
