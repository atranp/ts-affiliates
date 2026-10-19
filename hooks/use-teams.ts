"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { TeamMember } from "@/lib/admin/team";
import type { TeamDetail, TeamSummary } from "@/lib/teams/queries";

const TEAM_STALE_TIME = 60 * 1000;

/** Teams the affiliate sponsors; omit `affiliateId` for the signed-in affiliate. */
export function useTeams(affiliateId?: string, enabled = true) {
  const url = affiliateId
    ? `/api/teams?affiliateId=${affiliateId}`
    : "/api/teams";

  return useQuery({
    queryKey: queryKeys.teams(affiliateId),
    queryFn: () => apiFetch<{ teams: TeamSummary[] }>(url),
    enabled,
    staleTime: TEAM_STALE_TIME,
  });
}

export function useTeamDetail(teamId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.teamDetail(teamId ?? ""),
    queryFn: () => apiFetch<{ team: TeamDetail }>(`/api/teams/${teamId}`),
    enabled: enabled && !!teamId,
    staleTime: TEAM_STALE_TIME,
  });
}

/** Flat recruit list for affiliates whose downline predates named teams. */
export function useTeamRoster(affiliateId?: string, enabled = true) {
  const url = affiliateId
    ? `/api/team?affiliateId=${affiliateId}`
    : "/api/team";

  return useQuery({
    queryKey: queryKeys.teamRoster(affiliateId),
    queryFn: () => apiFetch<{ team: TeamMember[] }>(url),
    enabled,
    staleTime: TEAM_STALE_TIME,
  });
}
