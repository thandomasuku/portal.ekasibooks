/**
 * Server-only helper used by Next.js route handlers to reach the ekasi-api backend.
 *
 * ONE-DOMAIN SETUP:
 * - Browser calls /api/* on the portal domain
 * - Portal route handlers proxy to the backend using this base URL
 *
 * Configure via env:
 *   EKASI_API_BASE_URL=http://localhost:4000
 * or EKASI_API_BASE=http://localhost:4000
 */
export function getApiBase(): string {
  const raw = (process.env.EKASI_API_BASE_URL || process.env.EKASI_API_BASE || "").trim();

  // Default for local dev only.
  if (!raw) {
    if (process.env.NODE_ENV !== "production") return "http://localhost:4000";
    // In production we prefer failing loudly instead of proxying to ourselves.
    return "";
  }

  return raw.replace(/\/+$/, "");
}
