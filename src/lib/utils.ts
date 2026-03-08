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

export const formatCurrency = (
  amount: number,
  currency: string = "USD",
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number; abs?: boolean }
) => {
  const value = options?.abs ? Math.abs(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: options?.maximumFractionDigits,
    minimumFractionDigits: options?.minimumFractionDigits,
  }).format(value);
};
