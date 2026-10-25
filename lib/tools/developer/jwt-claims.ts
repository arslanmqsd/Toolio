/** The registered claims of RFC 7519 §4.1, built from a form, plus durations like "1h" for exp and nbf. */

export interface ClaimsForm {
  iss: string;
  sub: string;
  /** One audience, or several separated by commas or spaces. */
  aud: string;
  jti: string;
  iat: boolean;
  /** How long from issue until it expires, like "1h"; blank for no exp. */
  exp: string;
  /** How long from issue until it's valid, like "5m" or "0"; blank for no nbf. */
  nbf: string;
}

const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

/**
 * Seconds in a duration like "90", "15m", "1h 30m" or "7d". Units are s, m, h, d and w; a bare
 * number is seconds. Null when it doesn't read as one.
 */
export function parseDuration(text: string): number | null {
  const clean = text.trim().toLowerCase();
  if (/^\d+$/.test(clean)) return Number(clean);
  if (!/^(\d+\s*[smhdw]\s*)+$/.test(clean)) return null;
  let total = 0;
  for (const [, amount, unit] of clean.matchAll(/(\d+)\s*([smhdw])/g)) total += Number(amount) * UNITS[unit];
  return total;
}

export const REGISTERED = ["iss", "sub", "aud", "iat", "nbf", "exp", "jti"] as const;

export interface BuiltPayload {
  payload: Record<string, unknown>;
  /** Form fields with a problem, and what it is. */
  errors: Partial<Record<keyof ClaimsForm, string>>;
  /** Registered claims the custom JSON also sets; its value wins. */
  overridden: string[];
}

/** The payload: registered claims from the form in their usual order, then the custom claims. */
export function buildPayload(form: ClaimsForm, custom: Record<string, unknown>, issuedAt: number): BuiltPayload {
  const errors: BuiltPayload["errors"] = {};
  const claims: Record<string, unknown> = {};
  if (form.iss.trim()) claims.iss = form.iss.trim();
  if (form.sub.trim()) claims.sub = form.sub.trim();
  const audiences = form.aud.split(/[\s,]+/).filter(Boolean);
  if (audiences.length) claims.aud = audiences.length === 1 ? audiences[0] : audiences;
  if (form.iat) claims.iat = issuedAt;
  for (const field of ["nbf", "exp"] as const) {
    if (!form[field].trim()) continue;
    const seconds = parseDuration(form[field]);
    if (seconds === null) errors[field] = "Use a number of seconds or units like 15m, 1h or 7d.";
    else claims[field] = issuedAt + seconds;
  }
  if (form.jti.trim()) claims.jti = form.jti.trim();

  const overridden = Object.keys(custom).filter((k) => k in claims);
  return { payload: { ...claims, ...custom }, errors, overridden };
}
