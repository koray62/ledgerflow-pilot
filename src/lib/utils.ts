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
