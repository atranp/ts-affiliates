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
import { AWAITING_PAYMENT } from '@/lib/payouts/status';
import { formatAppDate } from '@/lib/timezone';
import { cn, formatCurrency, formatSaleDate } from '@/lib/utils';

export function commissionAmountTone(
  status: string,
): 'primary' | 'success' | 'warning' | 'default' {
  if (status === 'PAID') return 'success';
  if (status === 'PENDING' || status === AWAITING_PAYMENT) return 'warning';
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
}: CommissionRowProps) {
  const variant = commissionTypeVariant(type);
  const metaLine = [
    formatSaleDate(occurredAt),
    orderRevenue ? `${formatCurrency(orderRevenue)} sale` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const paidDate = status === 'PAID' ? formatPaidDate(payoutWeek) : null;

  const content = (
    <>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="ts-row-title min-w-0 flex-1 leading-snug">{details}</p>
        <div className="shrink-0">
          <AffiliateAmountCell
            amount={amount}
            tone={commissionAmountTone(status)}
          />
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span
          className={cn(affiliateBadgeClass(variant), 'max-w-[55%] truncate')}
        >
          {formatCommissionType(type)}
        </span>
        <span className="ts-row-meta shrink-0 text-right font-medium">
          {formatCommissionStatus(status)}
          {paidDate ? (
            <>
              <span className="text-muted-foreground/50"> · </span>
              <span className="font-normal">{paidDate}</span>
            </>
          ) : null}
        </span>
      </div>
      {metaLine ? (
        <p className="ts-row-meta min-w-0 truncate">{metaLine}</p>
      ) : null}
    </>
  );

  const rowClass = cn(
    'ts-list-row min-w-0 max-w-full flex-col items-stretch gap-1.5',
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
