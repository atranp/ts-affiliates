import Link from "next/link";
import { ArrowRight, GitBranch, DollarSign, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  {
    step: 1,
    title: "Create teams",
    description: "Group recruits under a sponsor (e.g. Trin manages Team Blair + Team Sarah)",
    href: "/admin/teams",
    icon: UsersRound,
  },
  {
    step: 2,
    title: "Assign deal rules",
    description: "Link sponsor → recruit deals to a team, with rate & milestone",
    href: "/admin/deal-rules",
    icon: GitBranch,
  },
  {
    step: 3,
    title: "Run payouts",
    description: "Preview and pay unpaid commissions + team bonuses per team",
    href: "/admin/payouts",
    icon: DollarSign,
  },
];

export function SetupFlowCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-primary/20 bg-primary-soft/30 p-4 sm:p-5",
        className
      )}
    >
      <p className="text-sm font-medium text-foreground mb-1">
        How team payouts work
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Teams → Rules → Payouts. Each sponsor can manage multiple teams with
        different recruits and milestone deals.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {steps.map((item) => (
          <Link
            key={item.step}
            href={item.href}
            className="group flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-primary/40 hover:bg-card/80"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {item.step}
              </span>
              <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {item.description}
              </p>
            </div>
            <span className="mt-auto flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              Go <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
