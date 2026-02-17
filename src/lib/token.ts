import crypto from "crypto";

/**
 * Generate a cryptographically-secure random token suitable for email verification links.
 * Store only a SHA-256 hash in the database (never store the raw token).
 */
export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Deterministic one-way hash used to store/lookup tokens.
 */
export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}
