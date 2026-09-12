/** Affiliate-facing labels — keep admin jargon out of the partner portal. */

import { isLifetimeSaleType } from "@/lib/affiliate/lifetime";

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

export function formatCommissionType(
  type: string,
  options?: { isLifetimeSale?: boolean }
): string {
  if (options?.isLifetimeSale || isLifetimeSaleType(type)) {
    return AFFILIATE_COPY.commissions.typeLifetime;
  }

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
    links: 'Your Link',
    visits: 'Traffic',
    creatives: 'Creatives',
    coupons: 'Coupons',
    settings: 'Settings',
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
  performance: {
    earnings: 'Earnings',
    revenueGenerated: 'Sales generated',
    earningsTrendTitle: 'Earnings',
    earningsTrendDescription: 'What you earned each day',
    readyForPayout: 'Ready for payout',
    clicks: 'Clicks',
    sales: 'Sales',
    conversion: 'Conversion',
    attributionTitle: 'How your sales reached us',
    salesFromClicks: 'Sales from clicks',
    untracedSales: 'Sales with no click',
    weekTitle: 'Your week at a glance',
    weekDescription: 'Clicks and sales by day',
    noComparison: 'No earlier period to compare',
  },
  team: {
    title: 'Team',
    rosterTitle: 'Your Team Roster',
    rosterDescription:
      'Track member sales, your team cut, and who\u2019s working toward their milestone.',
    teamsSectionHint:
      'Your earnings from each member\u2019s sales \u2014 not what they owe you.',
    teamCutUnpaid: 'Your team cut',
    teamCutLocked: 'Locked until goal',
    theirSalesShort: 'team sales',
    goalReachedLine: 'Goal reached',
    empty: 'No team members yet.',
    loading: 'Loading team members...',
    viewCommissions: 'View commissions',
    viewUnpaid: 'View unpaid',
    teamRevenue: 'Team sales',
    payout: 'Unpaid',
    /** @deprecated Prefer teamCutUnpaid on member rows */
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
      payout: 'Your cut from members who reached their sales goal',
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
      sales: 'Their sales',
      goal: 'Sales milestone',
      payout: 'Your team cut',
      awaitingMilestone: 'Locked until goal',
    },
    filters: {
      sortSalesHigh: 'Highest sales',
      sortSalesLow: 'Lowest sales',
      sortGoalHigh: 'Closest to goal',
      sortGoalLow: 'Farthest from goal',
      sortUnpaidHigh: 'Highest team cut',
      sortUnpaidLow: 'Lowest team cut',
      sortNameAz: 'Name A\u2192Z',
      sortNameZa: 'Name Z\u2192A',
    },
  },
  commissions: {
    title: 'Your Commissions',
    description: 'Every sale and team earning tied to your account.',
    empty: 'No commissions yet.',
    noMatches: 'No commissions match these filters.',
    noMatchesHint: 'Try clearing filters or broadening your search.',
    searchPlaceholder: 'Search order or description…',
    allTeams: 'All teams',
    allMembers: 'All team members',
    allTypes: 'All types',
    allStatuses: 'All statuses',
    typeDirect: 'Direct sale',
    typeLifetime: 'Lifetime sale',
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
    exportCsv: 'Export CSV',
    tapForDetails: 'Tap a row for order and attribution details',
    desktopDetailHint: 'Select a row to view details',
    tracked: {
      linked: 'Link click',
      linkedHint: 'We matched this sale to a click on your link.',
      unlinked: 'No click',
      /**
       * Lifetime-linked customer sales — paid without a new link on this order.
       */
      linkedCustomer: 'Linked customer',
      linkedCustomerHint:
        'You referred this customer on an earlier order — no link or coupon was needed on this one.',
      unlinkedHint: 'Order was not traced to a click',
    },
    /** Commission detail drawer — see docs/COMMISSION-JOURNEY-PLAN.md */
    detail: {
      whyTitle: 'Why you earned this',
      orderTitle: 'Order',
      orderCommissionBase: 'Commission base (excl. shipping & tax)',
      orderShipping: 'Shipping',
      orderTax: 'Tax',
      orderTotal: 'Order total',
      customerTitle: 'Customer',
      journeyTitle: 'Journey',
      payoutTitle: 'Payout',
      loading: 'Loading details…',
      error: 'Could not load commission details.',
      errorHint: 'Check your connection and try again.',
      retry: 'Try again',
      close: 'Close',
      openHint: 'View order and attribution details',
      noJourney: 'Team bonuses do not include an attribution journey.',
      emptyOverrideCustomer: 'Customer details apply to the recruit’s direct sale.',
      why: {
        coupon: (code: string) =>
          `Your coupon ${code} was used. Coupon attribution beats link attribution.`,
        link: 'Your link was the last referral at checkout.',
        linkWithVisit:
          'Your link was clicked and was the last referral at checkout.',
        cookieNoClick:
          'Your referral was stored on this order. No new click was recorded.',
        lifetime:
          'Returning customer linked to you. No affiliate link or coupon on this order.',
        override: (recruitName: string, orderId: number) =>
          `Team bonus from ${recruitName}'s sale on order #${orderId}.`,
        none:
          'You were credited for this order. No coupon, link, or lifetime rule applied.',
      },
      customer: {
        linked: (orderIndex: number, totalOrders: number) =>
          `Linked customer · order ${orderIndex} of ${totalOrders}`,
        newCustomer: 'New customer',
        firstLinked: (orderId: number) =>
          `First linked on order #${orderId}`,
        firstLinkedOn: (date: string, orderId: number) =>
          `First linked · ${date} · Order #${orderId}`,
      },
      journey: {
        click: 'Link clicked',
        cookie: 'Referral stored on order',
        coupon: 'Coupon used',
        order: 'Order placed',
        commission: 'Commission recorded',
        payout: 'Paid out',
        customerLinked: 'Customer linked',
        firstLinked: (date: string, orderId: number) =>
          `First linked · ${date} · Order #${orderId}`,
        email: 'Returned via email',
      },
      payout: {
        pending: 'Pending payout',
        awaitingMilestone: 'Awaiting milestone',
        paid: (date: string) => `Paid ${date}`,
        batch: (label: string) => `Included in ${label}`,
      },
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
  links: {
    title: 'Your Referral Link',
    description: 'Share these to get credit for the sales you send.',
    yourLinkTitle: 'Your referral link',
    yourLinkDescription: 'Every sale that starts here is credited to you.',
    slugInUse: 'Using your custom slug',
    noSlug: 'Set a custom slug in Settings to get a shorter, branded link.',
    generatorTitle: 'Link to a specific page',
    generatorDescription:
      'Point people straight at a product or article and still get credit.',
    generatorLabel: 'Page on the True Sciences store',
    generatorPlaceholder: 'https://true-sciences.com/products/…',
    generatorAction: 'Create link',
    generatorResult: 'Your link to that page',
    generatorEmpty: 'Paste a link first.',
    generatorFailed: 'Could not build that link.',
  },
  visits: {
    title: 'Your Traffic',
    description: 'Clicks on your referral links, and what they turned into.',
    empty: 'No clicks yet. Share your link to start tracking traffic.',
    trendTitle: 'Clicks and sales',
    trendDescription: 'Daily',
    recentTitle: 'Recent clicks',
    recentDescription: 'Where people landed after following your link',
    convertedBadge: 'Sale',
    previous: 'Newer',
    next: 'Older',
    pageOf: (page: number, total: number) => `Page ${page} of ${total}`,
    stats: {
      total: 'Total clicks',
      last7: 'Last 7 days',
      last30: 'Last 30 days',
      converted: 'Turned into sales',
    },
  },
  creatives: {
    title: 'Creatives',
    description: 'Ready-made banners and copy, already linked to your account.',
    empty: 'No creatives available right now. Check back soon.',
    embedLabel: 'Paste this into your site or email',
    copyAction: 'Copy embed',
    previewAction: 'Preview page',
    copied: 'Embed copied',
    copyFailed: 'Could not copy the embed',
  },
  coupons: {
    title: 'Your Coupons',
    description: 'Discount codes that credit sales to you without a link.',
    panelTitle: 'Coupon codes',
    panelDescription:
      'Customers who use these are credited to you even if they never click your link.',
    empty: 'No coupon codes assigned to you yet.',
    unused: 'Not used yet',
    copied: 'Code copied',
    copyFailed: 'Could not copy the code',
    paidOrders: (count: number) => `${count} paid`,
    unpaidOrders: (count: number) => `${count} unpaid`,
    pendingOrders: (count: number) => `${count} awaiting milestone`,
  },
  settings: {
    title: 'Settings',
    description: 'How you get paid, and how your referral link looks.',
    panelTitle: 'Your details',
    panelDescription: 'Changes are saved to your affiliate account.',
    save: 'Save changes',
    saved: 'Settings saved',
    saveFailed: 'Could not save your settings.',
    linkPreviewTitle: 'Your referral link',
    linkPreviewDescription: 'Updates when you change your custom slug.',
    securityTitle: 'Security',
    securityDescription: 'Keep your account safe.',
    changePassword: 'Change password',
    fields: {
      paymentEmail: 'Payment email',
      paymentEmailHint:
        'Where payouts are sent. Leave blank to use your account email.',
      website: 'Website',
      customSlug: 'Custom link slug',
      customSlugPlaceholder: 'yourname',
      customSlugHint:
        'Letters and numbers only. Must be unique, and changes your referral link.',
    },
  },
  account: {
    changePassword: {
      title: 'Change password',
      description: 'Choose a strong password you do not use anywhere else.',
      requiredTitle: 'Choose your password',
      requiredDescription:
        'You signed in with a one-time link. Choose a password so you can get back in without one.',
      requiredBanner:
        'Set a password before using the Ambassador Portal. Your sign-in link cannot be used again.',
      panelTitle: 'New password',
      panelDescription:
        'Length matters more than symbols — a few unrelated words you will remember beats a short, clever one.',
      fields: {
        password: 'New password',
        confirm: 'Confirm new password',
      },
      requirements: {
        length: (min: number) => `At least ${min} characters`,
        strength: 'Not your email or an easy-to-guess pattern',
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
        'Need help? Contact your True Sciences administrator for a new sign-in link.',
      errors: {
        updateFailed: 'Unable to update password. Please try again.',
      },
    },
  },
} as const;
