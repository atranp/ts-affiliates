import { NextResponse } from "next/server";

const PRIVATE_CACHE = "private, max-age=30, stale-while-revalidate=120";

export function jsonCached<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": PRIVATE_CACHE,
      ...init?.headers,
    },
  });
}
