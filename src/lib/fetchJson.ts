export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    // Our auth uses an httpOnly cookie session, so credentials must be included.
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    // Expect your API to return { message?: string }
    const message =
      (data as any)?.message ||
      (data as any)?.error ||
      `Request failed (${res.status} ${res.statusText})`;
    throw new Error(message);
  }

  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
