/** Affiliate-facing labels — keep admin jargon out of the partner portal. */

export function formatCommissionStatus(status: string): string {
  switch (status) {
    case "PAID":
      return "Paid";
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
    inactive: "Inactive",
    active: "Active",
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
} as const;
