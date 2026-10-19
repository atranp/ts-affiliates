import { prisma } from "../prisma";
import { COMMISSION_CHUNK_SIZE } from "./constants";

export async function linkProfileToAffiliateByEmail(
  profileId: string,
  email: string
): Promise<void> {
  const affiliate = await prisma.affiliate.findFirst({
    where: { email: email.toLowerCase() },
  });

  if (!affiliate) return;

  await prisma.profile.update({
    where: { id: profileId },
    data: { affiliateId: affiliate.id },
  });
}

export async function autoLinkUnlinkedProfiles(): Promise<number> {
  const profiles = await prisma.profile.findMany({
    where: {
      affiliateId: null,
      role: "AFFILIATE",
    },
    select: { id: true, email: true },
  });

  if (profiles.length === 0) return 0;

  const emails = profiles.map((profile) => profile.email.toLowerCase());
  const affiliates = await prisma.affiliate.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });

  const affiliateByEmail = new Map(
    affiliates.map((affiliate) => [affiliate.email.toLowerCase(), affiliate.id])
  );

  let linked = 0;
  const linkUpdates = [];
  for (const profile of profiles) {
    const affiliateId = affiliateByEmail.get(profile.email.toLowerCase());
    if (!affiliateId) continue;

    linkUpdates.push(
      prisma.profile.update({
        where: { id: profile.id },
        data: { affiliateId },
      })
    );
    linked += 1;
  }

  for (let i = 0; i < linkUpdates.length; i += COMMISSION_CHUNK_SIZE) {
    await prisma.$transaction(linkUpdates.slice(i, i + COMMISSION_CHUNK_SIZE));
  }

  return linked;
}
