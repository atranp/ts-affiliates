import { Skeleton } from "@/components/ui/skeleton";
import { DataCardList, ResponsiveTable } from "@/components/ui/data-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TableSkeletonProps = {
  columns: number;
  rows?: number;
};

export function TableSkeleton({ columns, rows = 5 }: TableSkeletonProps) {
  return (
    <ResponsiveTable
      table={
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: columns }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, row) => (
              <TableRow key={row}>
                {Array.from({ length: columns }).map((_, col) => (
                  <TableCell key={col}>
                    <Skeleton className="h-4 w-full max-w-[140px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
      cards={
        <DataCardList>
          {Array.from({ length: rows }).map((_, row) => (
            <div
              key={row}
              className="space-y-2 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </DataCardList>
      }
    />
  );
}
