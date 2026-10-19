"use client";

import {
  AffiliateAmountCell,
  AffiliateSectionLabel,
} from "@/components/affiliate/primitives";
import type { PayoutOption, PayoutOptions } from "@/lib/payouts/options";
import { cn, formatCurrency } from "@/lib/utils";

export function PayoutOptionTree({
  data,
  selectedKey,
  onSelect,
}: {
  data: PayoutOptions;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="What to pay" className="space-y-3">
      {data.direct && (
        <div className="ts-payout-direct-group">
          <AffiliateSectionLabel>Direct earnings</AffiliateSectionLabel>
          <OptionRow
            option={data.direct}
            selected={selectedKey === data.direct.key}
            onSelect={() => onSelect(data.direct!.key)}
          />
        </div>
      )}

      {data.teams.map((team) => (
        <div key={team.teamId} className="ts-payout-team-group">
          <AffiliateSectionLabel
            action={
              <span className="ts-row-meta font-semibold tabular-nums text-violet-900">
                {formatCurrency(team.amount)}
              </span>
            }
          >
            {team.label} · {team.sublabel}
          </AffiliateSectionLabel>
          <div className="space-y-1.5">
            {team.members.map((member) => (
              <OptionRow
                key={member.key}
                option={member}
                selected={selectedKey === member.key}
                onSelect={() => onSelect(member.key)}
              />
            ))}
          </div>
        </div>
      ))}

      {data.unattributed.entryCount > 0 && (
        <div className="rounded-lg border border-amber-200/80 bg-warning-soft px-3 py-2.5">
          <p className="ts-row-meta leading-relaxed text-amber-900">
            <span className="font-semibold">
              {formatCurrency(data.unattributed.amount)}
            </span>{" "}
            across {data.unattributed.entryCount.toLocaleString("en-US")} unpaid{" "}
            {data.unattributed.entryCount === 1 ? "entry" : "entries"} is not
            listed above — bonuses, adjustments, and overrides with no team or
            member attached. Nothing on this screen can pay those yet.
          </p>
        </div>
      )}

      {data.awaitingDirectPayout.entryCount > 0 && (
        <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
          <p className="ts-row-meta leading-relaxed text-muted-foreground">
            <span className="font-semibold text-brand-dark">
              {formatCurrency(data.awaitingDirectPayout.amount)}
            </span>{" "}
            in team earnings is waiting on a recruit direct payout first — those
            sales are not in any paid direct receipt yet.
          </p>
        </div>
      )}
    </div>
  );
}

function OptionRow({
  option,
  selected,
  onSelect,
}: {
  option: PayoutOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "ts-payout-option",
        selected && "ts-payout-option-selected"
      )}
    >
      <span
        className={cn(
          "ts-payout-option-radio",
          selected && "ts-payout-option-radio-selected"
        )}
        aria-hidden
      >
        {selected && (
          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
        )}
      </span>

      <div className="min-w-0 flex-1 text-left">
        <p className="ts-row-title">{option.label}</p>
        <p className="ts-row-meta mt-0.5">{option.sublabel}</p>
        {option.math && (
          <p className="ts-micro mt-0.5 truncate">{option.math}</p>
        )}
      </div>

      <AffiliateAmountCell
        amount={formatCurrency(option.amount)}
        tone={selected ? "primary" : "default"}
      />
    </button>
  );
}
