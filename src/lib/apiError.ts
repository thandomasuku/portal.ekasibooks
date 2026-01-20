export function getErrorMessage(err: unknown, fallback = "Something went wrong") {
  if (!err) return fallback;

  // If you throw Response objects
  if (err instanceof Response) {
    return fallback;
  }

  // If you throw Error
  if (err instanceof Error) {
    return err.message || fallback;
  }

  // If you throw JSON-ish
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as any).message;
    if (typeof m === "string" && m.trim()) return m;
  }

  return fallback;
}
