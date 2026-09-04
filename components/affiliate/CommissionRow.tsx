'use client';

import { ChevronRight } from 'lucide-react';
import { AffiliateAmountCell } from '@/components/affiliate/primitives';
import {
  formatCommissionStatus,
  formatCommissionType,
} from '@/lib/affiliate/copy';
import { formatAppDate } from '@/lib/timezone';
import { cn, formatSaleDate } from '@/lib/utils';

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

function trackingLabel(
  trackedByClick: boolean | null | undefined,
  isLifetimeSale: boolean,
): string | null {
  if (isLifetimeSale) return 'Linked customer';
  if (trackedByClick === null || trackedByClick === undefined) return null;
  return trackedByClick ? 'Link click' : 'No click';
}

type CommissionRowProps = {
  details: string;
  occurredAt: string;
  orderRevenue: string | number | null;
  amount: string;
  status: string;
  type: string;
  payoutWeek?: string | null;
  trackedByClick?: boolean | null;
  isLifetimeSale?: boolean;
  onClick?: () => void;
  className?: string;
  layout?: 'card' | 'flat' | 'mobile';
};

function buildSubline({
  type,
  isLifetimeSale,
  trackedByClick,
  occurredAt,
  status,
  payoutWeek,
}: Pick<
  CommissionRowProps,
  'type' | 'isLifetimeSale' | 'trackedByClick' | 'occurredAt' | 'status' | 'payoutWeek'
>) {
  const paidDate = status === 'PAID' ? formatPaidDate(payoutWeek ?? null) : null;
  const statusLabel = paidDate
    ? `${formatCommissionStatus(status)} · ${paidDate}`
    : formatCommissionStatus(status);

  return [
    formatCommissionType(type, { isLifetimeSale }),
    trackingLabel(trackedByClick, isLifetimeSale ?? false),
    formatSaleDate(occurredAt),
    statusLabel,
  ]
    .filter(Boolean)
    .join(' · ');
}

function CommissionRowContent({
  details,
  occurredAt,
  amount,
  status,
  type,
  payoutWeek,
  trackedByClick,
  isLifetimeSale,
  onClick,
}: Omit<CommissionRowProps, 'layout' | 'className' | 'orderRevenue'>) {
  const subline = buildSubline({
    type,
    isLifetimeSale,
    trackedByClick,
    occurredAt,
    status,
    payoutWeek,
  });

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="ts-row-title truncate leading-5 text-brand-dark">
          {details}
        </p>
        <p className="ts-row-meta mt-0.5 truncate leading-4">{subline}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <AffiliateAmountCell
          amount={amount}
          tone={commissionAmountTone(status)}
        />
        {onClick ? (
          <ChevronRight className="ts-commission-chevron shrink-0" aria-hidden />
        ) : null}
      </div>
    </div>
  );
}

export function CommissionRow({
  details,
  occurredAt,
  amount,
  status,
  type,
  payoutWeek = null,
  trackedByClick = null,
  isLifetimeSale = false,
  onClick,
  className,
  layout = 'card',
}: CommissionRowProps) {
  const rowClass = cn(
    'min-w-0 max-w-full',
    layout === 'flat' && 'ts-divider-row',
    layout === 'mobile' && 'ts-commission-mobile-row',
    layout === 'card' && 'ts-list-row',
    onClick && 'cursor-pointer',
    className,
  );

  const content = (
    <CommissionRowContent
      details={details}
      occurredAt={occurredAt}
      amount={amount}
      status={status}
      type={type}
      payoutWeek={payoutWeek}
      trackedByClick={trackedByClick}
      isLifetimeSale={isLifetimeSale}
      onClick={onClick}
    />
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
