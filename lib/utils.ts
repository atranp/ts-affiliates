import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export {
  formatCurrency,
  formatSaleDate,
  mapWithConcurrency,
  toNumber,
} from "@/lib/format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
