// Client-side wrapper for the edit endpoint.
export async function requestEdit(
  frame: string,
  prompt: string
): Promise<string> {
  const res = await fetch("/api/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frame, prompt }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.image) {
    throw new Error(body?.error ?? `Edit request failed (${res.status})`);
  }
  return body.image;
}
