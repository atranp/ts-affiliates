/** Affiliate-facing labels — keep admin jargon out of the partner portal. */

export function formatCommissionStatus(status: string): string {
  switch (status) {
    case 'PAID':
      return 'Paid';
    case 'UNPAID':
      return 'Unpaid';
    case 'PENDING':
      return 'Awaiting milestone';
    default:
      return status;
  }
}

export function formatCommissionType(type: string): string {
  switch (type) {
    case 'OVERRIDE':
      return 'Team earnings';
    case 'DIRECT':
    case 'COMMISSION':
      return 'Direct sale';
    default:
      return type
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase());
  }
}

export function memberCountLabel(count: number): string {
  return `${count} team member${count === 1 ? '' : 's'}`;
}

export function teamDealLabel(
  ratePercent: string,
  milestoneRevenueThreshold: string | null,
  formatAmount: (value: number) => string,
): string {
  const rate = `${ratePercent}% of team earnings`;
  if (!milestoneRevenueThreshold) return rate;
  return `${rate} once a member reaches ${formatAmount(
    Number(milestoneRevenueThreshold),
  )} in sales`;
}

export const AFFILIATE_COPY = {
  portal: {
    label: 'Partner Portal',
    badge: 'Partner',
  },
  tabs: {
    home: 'Home',
    commissions: 'Commissions',
    team: 'Team',
    payouts: 'Payouts',
  },
  stats: {
    owed: {
      label: 'Ready for payout',
      hint: 'Included in the next payout run',
      action: 'Commissions',
    },
    paid: {
      label: 'Paid out',
      hint: 'Already sent to you',
      action: 'Payouts',
    },
    pending: {
      label: 'Awaiting milestone',
      hint: 'Unlocks when a team member hits their sales goal',
      action: 'Team',
    },
    payouts: {
      label: 'Total payouts',
      action: 'Payouts',
    },
  },
  home: {
    subtitle: 'Your commissions, team, and payout history in one place.',
    teamsTitle: 'Your teams',
    teamsAction: 'View team',
    teamsSubtitle: "Earnings from people you've brought on",
    topProducers: 'Top producers',
    viewFullRoster: 'View full roster',
    teamEarningsTitle: 'Team earnings',
    payoutsTitle: 'Recent payouts',
    payoutsDescription: 'Transfers recorded for your account',
    payoutsAction: 'View all',
    payoutsColumns: {
      payout: 'Payout',
      amount: 'Amount',
    },
    commissionsTitle: 'Recent commissions',
    commissionsSubtitle: 'Your latest sales and team earnings',
    commissionsColumns: {
      details: 'Details',
      type: 'Type',
      amount: 'Earnings',
      status: 'Status',
    },
    recentCommissions: 'Recent activity',
    viewAllCommissions: 'View all',
    salesLabel: 'Sales',
  },
  team: {
    title: 'Team',
    rosterTitle: 'Your Team Roster',
    rosterDescription:
      'Track sales goals, team earnings, and who\u2019s producing.',
    empty: 'No team members yet.',
    loading: 'Loading team members...',
    viewCommissions: 'View commissions',
    viewUnpaid: 'View unpaid',
    teamRevenue: 'Team sales',
    payout: 'Unpaid',
    awaitingMilestone: 'Awaiting milestone',
    paid: 'Paid',
    salesGoal: 'Sales milestone',
    goalReached: 'Milestone reached',
    goalReachedShort: 'Reached',
    inactive: 'Inactive',
    active: 'Active',
    readyForPayout: 'Ready for payout',
    teamDeal: 'Team deal',
    searchPlaceholder: 'Search team members…',
    noMatches: 'No team members match these filters.',
    allMembers: 'All',
    statsHints: {
      payout: 'From members who reached their sales goal',
      teamRevenue: 'Combined sales across your team',
      awaitingMilestone: 'Unlocks when a member hits their sales milestone',
      paid: 'Already included in a payout',
      teamDeal: 'Your cut of team member sales',
    },
    segments: {
      earning: 'Earning',
      ramping: 'Working toward goal',
      inactive: 'No sales yet',
    },
    columns: {
      member: 'Member',
      sales: 'Sales',
      goal: 'Sales milestone',
      payout: 'Unpaid',
      awaitingMilestone: 'Awaiting milestone',
    },
    filters: {
      sortSalesHigh: 'Highest sales',
      sortSalesLow: 'Lowest sales',
      sortGoalHigh: 'Closest to goal',
      sortGoalLow: 'Farthest from goal',
      sortUnpaidHigh: 'Highest unpaid',
      sortUnpaidLow: 'Lowest unpaid',
      sortNameAz: 'Name A\u2192Z',
      sortNameZa: 'Name Z\u2192A',
    },
  },
  commissions: {
    title: 'Your Commissions',
    description: 'Every sale and team earning tied to your account.',
    empty: 'No commissions yet.',
    noMatches: 'No commissions match these filters.',
    searchPlaceholder: 'Search order or description…',
    allTeams: 'All teams',
    allMembers: 'All team members',
    allTypes: 'All types',
    allStatuses: 'All statuses',
    typeDirect: 'Direct sale',
    typeTeam: 'Team earnings',
    clearFilters: 'Clear filters',
    filters: {
      allEntries: 'All entries',
      removeFilter: 'Remove filter',
      statusLabel: 'Status',
      typeLabel: 'Type',
      sortLabel: 'Sort by',
      sortNewest: 'Newest first',
      sortOldest: 'Oldest first',
      sortAmountHigh: 'Highest earnings',
      sortAmountLow: 'Lowest earnings',
      sortSaleHigh: 'Largest sale',
    },
    statsHints: {
      payout: 'Ready for your next payout run',
      paid: 'Already sent to you',
      awaitingMilestone:
        'Unlocks when a team member hits their sales milestone',
      teamEarnings: "Bonuses from your team members' sales",
    },
    tabs: {
      all: 'All',
      payout: 'Unpaid',
      paid: 'Paid',
      teamEarnings: 'Team earnings',
      awaitingMilestone: 'Awaiting milestone',
    },
    columns: {
      date: 'Date',
      type: 'Type',
      details: 'Details',
      sale: 'Sale amount',
      amount: 'Your earnings',
      payout: 'Payout date',
      status: 'Status',
    },
  },
  payouts: {
    title: 'Payouts',
    historyTitle: 'Payout History',
    description: 'Receipts for transfers recorded on your account.',
    empty: 'No payouts yet. When a payout is recorded, it will show up here.',
    columns: {
      payout: 'Payout',
      date: 'Date',
      commissions: 'Commissions',
      amount: 'Amount',
    },
  },
  account: {
    changePassword: {
      title: 'Change password',
      description: 'Choose a strong password you do not use anywhere else.',
      requiredTitle: 'Set a new password',
      requiredDescription:
        'Your administrator issued a temporary password. Choose a new one to continue.',
      requiredBanner:
        'You must set a new password before you can use the Ambassador Portal.',
      panelTitle: 'New password',
      panelDescription: 'At least 8 characters. Use a mix you will remember.',
      fields: {
        password: 'New password',
        confirm: 'Confirm new password',
      },
      requirements: {
        length: (min: number) => `At least ${min} characters`,
        match: 'Passwords match',
      },
      submit: 'Update password',
      submitRequired: 'Continue to dashboard',
      submitting: 'Saving…',
      success: 'Password updated',
      successTitle: 'Password updated',
      successDescription:
        'Your new password is saved. You can use the Ambassador Portal now.',
      successRedirecting: 'Taking you to your dashboard…',
      successAction: 'Go to dashboard',
      footer:
        'Need help? Contact your True Sciences administrator to reset your password.',
      errors: {
        updateFailed: 'Unable to update password. Please try again.',
      },
    },
  },
} as const;
