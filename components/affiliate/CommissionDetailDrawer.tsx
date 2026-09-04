"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CircleDollarSign,
  Cookie,
  Link2,
  Mail,
  ShoppingBag,
  Tag,
  UserCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CommissionTypeBadge } from "@/components/affiliate/AffiliateBadge";
import { commissionAmountTone } from "@/components/affiliate/CommissionRow";
import { TrackedByBadge } from "@/components/affiliate/TrackedByBadge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import {
  formatCommissionStatus,
  AFFILIATE_COPY,
} from "@/lib/affiliate/copy";
import { apiFetch } from "@/lib/api-client";
import type { CommissionDetailResponse } from "@/lib/ledger/commission-detail";
import type { JourneyStepKind } from "@/lib/ledger/attribution-audit";
import { cn, formatCurrency, formatSaleDate } from "@/lib/utils";

type CommissionDetailDrawerProps = {
  entryId: string | null;
  onClose: () => void;
};

const copy = AFFILIATE_COPY.commissions.detail;

const JOURNEY_ICONS: Record<JourneyStepKind, LucideIcon> = {
  click: Link2,
  cookie: Cookie,
  coupon: Tag,
  order: ShoppingBag,
  commission: CircleDollarSign,
  payout: Wallet,
  customer_linked: UserCheck,
  email: Mail,
};

function journeyMetaLine(meta?: Record<string, string>): string | null {
  if (!meta) return null;
  if (meta.landing) return meta.landing;
  if (meta.code) return meta.code;
  if (meta.orderId) return `Order #${meta.orderId}`;
  if (meta.source) return meta.source;
  return null;
}

function DetailSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("ts-detail-section space-y-3", className)}>
      <h3 className="ts-detail-section-title">{title}</h3>
      {children}
    </section>
  );
}

function DetailFact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="ts-detail-fact">
      <dt className="ts-detail-fact-label">{label}</dt>
      <dd className="ts-detail-fact-value">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="h-6 w-24 rounded-full bg-muted" />
            <div className="h-3 w-28 rounded bg-muted/80" />
          </div>
          <div className="h-7 w-20 rounded bg-muted" />
        </div>
        <div className="mt-3 h-3 w-16 rounded bg-muted/70" />
      </div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="space-y-3 rounded-xl border border-border/60 px-4 py-3.5"
        >
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="h-4 w-full rounded bg-muted/80" />
          <div className="h-4 w-2/3 rounded bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

function JourneyTimeline({
  steps,
}: {
  steps: CommissionDetailResponse["journey"];
}) {
  if (steps.length === 0) return null;

  return (
    <ol className="ts-journey-list">
      {steps.map((step, index) => {
        const Icon = JOURNEY_ICONS[step.kind];
        const meta = journeyMetaLine(step.meta);

        return (
          <li
            key={`${step.kind}-${step.at}-${index}`}
            className="ts-journey-step"
          >
            <span className="ts-journey-dot">
              <Icon className="h-3 w-3 text-muted-foreground" aria-hidden />
            </span>
            <p className="ts-row-title text-sm leading-snug">{step.label}</p>
            <p className="ts-row-meta mt-0.5">{formatSaleDate(step.at)}</p>
            {meta ? (
              <p className="ts-row-meta mt-0.5 break-all text-muted-foreground/90">
                {meta}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function DetailBody({ detail }: { detail: CommissionDetailResponse }) {
  const { entry, why, order, customer, journey, payout } = detail;
  const tone = commissionAmountTone(entry.status);
  const isOverride = entry.type === "OVERRIDE";

  return (
    <div className="space-y-4 pb-2">
      <div className="rounded-xl border border-border/70 bg-muted/15 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <CommissionTypeBadge
                type={entry.type}
                isLifetimeSale={entry.isLifetimeSale}
              />
              <TrackedByBadge
                tracked={entry.trackedByClick}
                isLifetimeSale={entry.isLifetimeSale}
              />
            </div>
            <p className="ts-row-meta">{formatSaleDate(entry.occurredAt)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className={cn(
                "ts-amount text-xl tabular-nums leading-none",
                tone === "success" && "text-emerald-700",
                tone === "warning" && "text-amber-700",
                tone === "primary" && "text-primary",
              )}
            >
              {formatCurrency(entry.amount)}
            </p>
            <p className="ts-row-meta mt-1.5 font-medium">
              {formatCommissionStatus(entry.status)}
            </p>
          </div>
        </div>
      </div>

      <section className="ts-detail-callout">
        <h3 className="ts-detail-section-title mb-2">{copy.whyTitle}</h3>
        <p className="ts-detail-callout-text">{why.headline}</p>
        {why.detail ? (
          <p className="ts-row-meta mt-2 text-sm leading-relaxed">{why.detail}</p>
        ) : null}
      </section>

      {order ? (
        <DetailSection title={copy.orderTitle}>
          <dl className="ts-detail-fact-list">
            <DetailFact label="Order" value={`#${order.id}`} />
            <DetailFact
              label={copy.orderCommissionBase}
              value={formatCurrency(order.commissionBase)}
            />
            {order.shipping !== null ? (
              <DetailFact
                label={copy.orderShipping}
                value={formatCurrency(order.shipping)}
              />
            ) : null}
            {order.tax !== null ? (
              <DetailFact
                label={copy.orderTax}
                value={formatCurrency(order.tax)}
              />
            ) : null}
            {order.orderTotal !== null ? (
              <DetailFact
                label={copy.orderTotal}
                value={formatCurrency(order.orderTotal)}
              />
            ) : null}
            <DetailFact label="Date" value={order.date} />
            {order.coupons.length > 0 ? (
              <DetailFact
                label={order.coupons.length > 1 ? "Coupons" : "Coupon"}
                value={order.coupons.join(", ")}
              />
            ) : null}
          </dl>
        </DetailSection>
      ) : null}

      {customer ? (
        <DetailSection title={copy.customerTitle}>
          <div className="space-y-1.5">
            <p className="text-sm font-medium leading-relaxed text-brand-dark">
              {customer.label}
            </p>
            {customer.firstOrderId && customer.firstLinkedAt ? (
              <p className="ts-row-meta text-sm leading-relaxed">
                {copy.customer.firstLinkedOn(
                  formatSaleDate(customer.firstLinkedAt),
                  customer.firstOrderId,
                )}
              </p>
            ) : null}
          </div>
        </DetailSection>
      ) : isOverride ? (
        <DetailSection title={copy.customerTitle}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {copy.emptyOverrideCustomer}
          </p>
        </DetailSection>
      ) : null}

      {journey.length > 0 ? (
        <DetailSection title={copy.journeyTitle}>
          <JourneyTimeline steps={journey} />
        </DetailSection>
      ) : isOverride ? (
        <DetailSection title={copy.journeyTitle}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {copy.noJourney}
          </p>
        </DetailSection>
      ) : null}

      {payout ? (
        <DetailSection title={copy.payoutTitle}>
          <dl className="ts-detail-fact-list">
            <DetailFact label="Status" value={payout.status} />
            {payout.batchLabel ? (
              <DetailFact
                label="Batch"
                value={copy.payout.batch(payout.batchLabel)}
              />
            ) : null}
          </dl>
        </DetailSection>
      ) : null}
    </div>
  );
}

function DetailError({
  message,
  hint,
  onRetry,
  onClose,
}: {
  message: string;
  hint?: string;
  onRetry?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center">
      <AlertCircle className="h-8 w-8 text-muted-foreground/70" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium text-brand-dark">{message}</p>
        {hint ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {copy.retry}
          </Button>
        ) : null}
        {onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            {copy.close}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function CommissionDetailDrawer({
  entryId,
  onClose,
}: CommissionDetailDrawerProps) {
  const open = entryId !== null;
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, error, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["commission-detail", entryId],
    queryFn: () =>
      apiFetch<CommissionDetailResponse>(`/api/ledger/${entryId}/detail`),
    enabled: open,
  });

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const focusable = panelRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [open, data]);

  const title =
    data?.entry.description ??
    (data?.order ? `Order #${data.order.id}` : copy.openHint);

  const description =
    data?.entry.description && data.order
      ? `Order #${data.order.id}`
      : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isLoading && !data ? copy.loading : title}
      description={description}
      className="max-w-full sm:max-w-md lg:max-w-lg"
    >
      <div ref={panelRef}>
        {isLoading || (isFetching && !data) ? (
          <DetailSkeleton />
        ) : error ? (
          <DetailError
            message={copy.error}
            hint={copy.errorHint}
            onRetry={() => refetch()}
            onClose={onClose}
          />
        ) : data ? (
          <DetailBody detail={data} />
        ) : (
          <DetailError message={copy.error} onClose={onClose} />
        )}
      </div>
    </Sheet>
  );
}
