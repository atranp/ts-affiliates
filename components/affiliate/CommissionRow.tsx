'use client';

import {
  affiliateBadgeClass,
  commissionTypeVariant,
} from '@/components/affiliate/AffiliateBadge';
import { AffiliateAmountCell } from '@/components/affiliate/primitives';
import {
  formatCommissionStatus,
  formatCommissionType,
} from '@/lib/affiliate/copy';
import { formatAppDate } from '@/lib/timezone';
import { cn, formatCurrency, formatSaleDate } from '@/lib/utils';

export function commissionAmountTone(
  status: string,
): 'primary' | 'success' | 'warning' | 'default' {
  if (status === 'PAID') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'UNPAID') return 'primary';
  return 'default';
}

function formatPaidDate(iso: string | null) {
  if (!iso) return null;
  return formatAppDate(iso, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

type CommissionRowProps = {
  details: string;
  occurredAt: string;
  orderRevenue: string | number | null;
  amount: string;
  status: string;
  type: string;
  payoutWeek?: string | null;
  onClick?: () => void;
  className?: string;
  /** Card = standalone bordered row; flat = divider row inside a panel */
  layout?: 'card' | 'flat';
};

export function CommissionRow({
  details,
  occurredAt,
  orderRevenue,
  amount,
  status,
  type,
  payoutWeek = null,
  onClick,
  className,
  layout = 'card',
}: CommissionRowProps) {
  const variant = commissionTypeVariant(type);
  const metaLine = [
    formatSaleDate(occurredAt),
    orderRevenue ? `${formatCurrency(orderRevenue)} sale` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const paidDate = status === 'PAID' ? formatPaidDate(payoutWeek) : null;

  const statusLine = (
    <>
      {formatCommissionStatus(status)}
      {paidDate ? (
        <>
          <span className="text-muted-foreground/50"> · </span>
          <span className="font-normal">{paidDate}</span>
        </>
      ) : null}
    </>
  );

  const content =
    layout === 'flat' ? (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="ts-row-title truncate leading-snug">{details}</p>
          <span className={affiliateBadgeClass(variant)}>
            {formatCommissionType(type)}
          </span>
          {metaLine ? (
            <p className="ts-row-meta truncate">{metaLine}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <AffiliateAmountCell
            amount={amount}
            tone={commissionAmountTone(status)}
          />
          <p className="ts-row-meta leading-none">{statusLine}</p>
        </div>
      </div>
    ) : (
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="ts-row-title truncate leading-snug">{details}</p>
          <span className={affiliateBadgeClass(variant)}>
            {formatCommissionType(type)}
          </span>
          {metaLine ? (
            <p className="ts-row-meta truncate">{metaLine}</p>
          ) : null}
        </div>
        <div className="shrink-0 space-y-1 text-right">
          <AffiliateAmountCell
            amount={amount}
            tone={commissionAmountTone(status)}
          />
          <p className="ts-row-meta font-medium leading-snug">{statusLine}</p>
        </div>
      </div>
    );

  const rowClass = cn(
    'min-w-0 max-w-full',
    layout === 'flat'
      ? 'ts-divider-row'
      : 'ts-list-row',
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={rowClass}>
        {content}
      </button>
    );
  }

  return <div className={rowClass}>{content}</div>;
}
