/** Affiliate-facing labels — keep admin jargon out of the partner portal. */

import { AWAITING_PAYMENT } from "@/lib/payouts/status";

export function formatCommissionStatus(status: string): string {
  switch (status) {
    case "PAID":
      return "Paid";
    case AWAITING_PAYMENT:
      return "Awaiting payment";
    case "UNPAID":
      return "Owed";
    case "PENDING":
      return "Pending";
    default:
      return status;
  }
}

export function formatCommissionType(type: string): string {
  switch (type) {
    case "OVERRIDE":
      return "Team earnings";
    case "COMMISSION":
      return "Direct sale";
    default:
      return type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}

export function memberCountLabel(count: number): string {
  return `${count} team member${count === 1 ? "" : "s"}`;
}

export function teamDealLabel(
  ratePercent: string,
  milestoneRevenueThreshold: string | null,
  formatAmount: (value: number) => string
): string {
  const rate = `${ratePercent}% of team earnings`;
  if (!milestoneRevenueThreshold) return rate;
  return `${rate} once a member reaches ${formatAmount(
    Number(milestoneRevenueThreshold)
  )} in sales`;
}

export const AFFILIATE_COPY = {
  portal: {
    label: "Partner Portal",
    badge: "Partner",
  },
  tabs: {
    home: "Home",
    commissions: "Commissions",
    team: "Team",
    payouts: "Payouts",
  },
  stats: {
    owed: {
      label: "Owed to you",
      hint: "Included in the next payout run",
      action: "Commissions",
    },
    paid: {
      label: "Paid out",
      hint: "Already sent to you",
      action: "Payouts",
    },
    pending: {
      label: "Pending",
      hint: "Unlocks when a team member hits their sales goal",
      action: "Team",
    },
  },
  home: {
    subtitle: "Your commissions, team, and payout history in one place.",
    teamsTitle: "Your teams",
    teamsAction: "View team",
    teamEarningsTitle: "Team earnings",
    payoutsTitle: "Recent payouts",
    payoutsDescription: "Transfers recorded for your account",
    payoutsAction: "View all",
    salesLabel: "Sales",
  },
  team: {
    title: "Team",
    empty: "No team members yet.",
    loading: "Loading team members...",
    viewCommissions: "View commissions",
    viewUnpaid: "View owed",
    teamRevenue: "Team sales",
    owed: "Owed",
    pending: "Pending",
    paid: "Paid",
    salesGoal: "Sales goal",
    goalReached: "Goal reached",
    goalReachedShort: "Reached",
    inactive: "Inactive",
    active: "Active",
    owedToYou: "Owed to you",
    teamDeal: "Team deal",
    searchPlaceholder: "Search team members…",
    noMatches: "No team members match these filters.",
    allMembers: "All",
    segments: {
      earning: "Earning",
      ramping: "Working toward goal",
      inactive: "No sales yet",
    },
    columns: {
      member: "Member",
      sales: "Sales",
      goal: "Sales goal",
      owed: "Owed",
      pending: "Pending",
    },
    concentration: (name: string, percent: number) =>
      `${name} drove ${percent}% of team sales.`,
  },
  commissions: {
    title: "Commissions",
    description: "Every sale and team earning tied to your account.",
    empty: "No commissions yet.",
    noMatches: "No commissions match these filters.",
    searchPlaceholder: "Search order or description…",
    allTeams: "All teams",
    allMembers: "All team members",
    clearFilters: "Clear filters",
    tabs: {
      all: "All",
      owed: "Owed",
      paid: "Paid",
      teamEarnings: "Team earnings",
    },
    columns: {
      date: "Date",
      type: "Type",
      details: "Details",
      sale: "Sale amount",
      amount: "Your earnings",
      payout: "Payout date",
      status: "Status",
    },
  },
  payouts: {
    title: "Payouts",
    description: "Transfers sent to you after admin runs a payout.",
    empty: "No payouts yet. When a payout is processed, it will show up here.",
  },
  account: {
    changePassword: {
      title: "Change password",
      description: "Choose a strong password you do not use anywhere else.",
      requiredTitle: "Set a new password",
      requiredDescription:
        "Your administrator issued a temporary password. Choose a new one to continue.",
      requiredBanner:
        "You must set a new password before you can use the Ambassador Portal.",
      panelTitle: "New password",
      panelDescription: "At least 8 characters. Use a mix you will remember.",
      fields: {
        password: "New password",
        confirm: "Confirm new password",
      },
      requirements: {
        length: (min: number) => `At least ${min} characters`,
        match: "Passwords match",
      },
      submit: "Update password",
      submitRequired: "Continue to dashboard",
      submitting: "Saving…",
      success: "Password updated",
      footer:
        "Need help? Contact your True Sciences administrator to reset your password.",
      errors: {
        updateFailed: "Unable to update password. Please try again.",
      },
    },
  },
} as const;
