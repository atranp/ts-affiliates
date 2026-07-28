import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getSettings } from "@/lib/settings";
import { testSliceWPConnection } from "@/lib/slicewp";

export async function POST() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const settings = await getSettings();

  if (!settings.wcStoreUrl) {
    return NextResponse.json(
      { error: "Store URL is not configured" },
      { status: 400 }
    );
  }

  if (!settings.slicewpConsumerKey || !settings.slicewpConsumerSecret) {
    return NextResponse.json(
      {
        error:
          "SliceWP credentials are missing. Save Consumer Key and Secret in Integrations.",
      },
      { status: 400 }
    );
  }

  try {
    await testSliceWPConnection(
      settings.wcStoreUrl,
      settings.slicewpConsumerKey,
      settings.slicewpConsumerSecret
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "SliceWP connection failed",
      },
      { status: 400 }
    );
  }
}
