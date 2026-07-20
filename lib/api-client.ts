export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      (body as { error?: string }).error ?? `Request failed (${res.status})`
    );
  }

  return body as T;
}
