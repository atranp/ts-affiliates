import type { Prisma } from "@prisma/client";

export const LEDGER_SORT_KEYS = [
  "date",
  "type",
  "details",
  "sale",
  "amount",
  "status",
] as const;

export type LedgerSortKey = (typeof LEDGER_SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

export function resolveLedgerSortKey(value: string | null): LedgerSortKey {
  return LEDGER_SORT_KEYS.find((key) => key === value) ?? "date";
}

export function resolveLedgerSortDir(
  value: string | null,
  sortKey: LedgerSortKey = "date"
): SortDirection {
  if (value === "asc" || value === "desc") return value;
  return defaultSortDirection(sortKey);
}

export function defaultSortDirection(key: LedgerSortKey): SortDirection {
  if (key === "date" || key === "sale" || key === "amount") return "desc";
  return "asc";
}

export function ledgerSortParamsForUrl(
  key: LedgerSortKey,
  dir: SortDirection
): { sort: string | null; dir: string | null } {
  return {
    sort: key === "date" ? null : key,
    dir: dir === defaultSortDirection(key) ? null : dir,
  };
}

type SortableEntry = {
  id: string;
  type: string;
  amount: string | number;
  status: string;
  description: string | null;
  orderRevenue: string | number | null;
  occurredAt: string;
  sourceAffiliate?: {
    displayName: string | null;
    email: string;
  } | null;
};

function detailsLabel(entry: SortableEntry): string {
  return (
    entry.description ??
    entry.sourceAffiliate?.displayName ??
    entry.sourceAffiliate?.email ??
    ""
  ).toLowerCase();
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function compareLedgerEntries(
  a: SortableEntry,
  b: SortableEntry,
  sortBy: LedgerSortKey
): number {
  let cmp = 0;

  switch (sortBy) {
    case "date":
      cmp =
        new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
      break;
    case "type":
      cmp = a.type.localeCompare(b.type);
      break;
    case "details":
      cmp = detailsLabel(a).localeCompare(detailsLabel(b));
      break;
    case "sale":
      cmp = compareValues(
        a.orderRevenue ?? -1,
        b.orderRevenue ?? -1
      );
      break;
    case "amount":
      cmp = compareValues(Number(a.amount), Number(b.amount));
      break;
    case "status":
      cmp = a.status.localeCompare(b.status);
      break;
  }

  if (cmp !== 0) return cmp;
  return a.id.localeCompare(b.id);
}

export function sortLedgerEntries<T extends SortableEntry>(
  entries: T[],
  sortBy: LedgerSortKey,
  sortDir: SortDirection
): T[] {
  const multiplier = sortDir === "asc" ? 1 : -1;
  return [...entries].sort(
    (a, b) => multiplier * compareLedgerEntries(a, b, sortBy)
  );
}

export function buildLedgerOrderBy(
  sortBy: LedgerSortKey,
  sortDir: SortDirection
): Prisma.LedgerEntryOrderByWithRelationInput[] {
  const tieBreak: Prisma.LedgerEntryOrderByWithRelationInput[] = [
    { occurredAt: "desc" },
    { id: "desc" },
  ];

  switch (sortBy) {
    case "date":
      return [{ occurredAt: sortDir }, { id: sortDir }];
    case "type":
      return [{ type: sortDir }, ...tieBreak];
    case "details":
      return [{ description: sortDir }, ...tieBreak];
    case "sale":
      return [{ orderRevenue: sortDir }, ...tieBreak];
    case "amount":
      return [{ amount: sortDir }, ...tieBreak];
    case "status":
      return [{ status: sortDir }, ...tieBreak];
  }
}
