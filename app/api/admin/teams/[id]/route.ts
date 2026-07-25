import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getTeamDetail } from "@/lib/teams/queries";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const team = await getTeamDetail(params.id);
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  return NextResponse.json({ team });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { name, description, active } = body as {
    name?: string;
    description?: string | null;
    active?: boolean;
  };

  const existing = await prisma.team.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const team = await prisma.team.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined
        ? { description: description?.trim() || null }
        : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });

  return NextResponse.json(team);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const existing = await prisma.team.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  await prisma.team.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
