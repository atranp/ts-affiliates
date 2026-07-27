export const SLICEWP_DOWNLINE_KEY = "downline";

export function isSlicewpDownlineTeam(team: { slicewpKey: string | null }) {
  return team.slicewpKey === SLICEWP_DOWNLINE_KEY;
}
