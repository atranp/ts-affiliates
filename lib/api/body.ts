import { NextResponse } from "next/server";

type JsonObjectResult =
  | { body: Record<string, unknown> }
  | { error: NextResponse };

/**
 * Reads a JSON object body. Anything else — malformed JSON, an array, a bare
 * value — becomes a 400 with `invalidMessage`, so handlers can destructure
 * fields without guarding against a non-object.
 */
export async function readJsonObject(
  request: Request,
  invalidMessage = "Invalid JSON body"
): Promise<JsonObjectResult> {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      error: NextResponse.json({ error: invalidMessage }, { status: 400 }),
    };
  }
  return { body: body as Record<string, unknown> };
}
