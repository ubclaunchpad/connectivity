// Probe identity check shared by check-in and upload.
//
// A probe proves who it is with its probe ID and a device token sent in the
// X-Probe-Token header. The database stores only the SHA-256 hash of each
// token, so the token is hashed here and looked up by hash.
//
// Callers must serve these functions with verify_jwt = false (probes hold no
// Supabase JWT), which makes this check the only gate in front of the data.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";

export const PROBE_TOKEN_HEADER = "X-Probe-Token";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProbeIdentity {
  probeId: string;
}

/** Returns the canonical lowercase probe ID, or null if the value is not a UUID. */
export function parseProbeId(value: unknown): string | null {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

/** Lowercase hex SHA-256 of the UTF-8 token, matching probe_credentials.token_hash. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Returns the probe's identity when the token belongs to this probe, the
 * credential is not revoked, and the probe is not disabled. Returns null for
 * every credential failure, so callers can respond identically to all of them.
 *
 * Throws when the database cannot be read: that is a server failure, not a
 * rejected credential. The thrown error carries no request data.
 */
export async function verifyProbeToken(
  client: SupabaseClient,
  probeId: string,
  token: string | null,
): Promise<ProbeIdentity | null> {
  if (!token) return null;

  const tokenHash = await hashToken(token);

  const credential = await client
    .from("probe_credentials")
    .select("id")
    .eq("token_hash", tokenHash)
    .eq("probe_id", probeId)
    .is("revoked_at", null)
    .maybeSingle();
  if (credential.error) throw new Error("probe credential lookup failed");
  if (!credential.data) return null;

  const probe = await client
    .from("probes")
    .select("id")
    .eq("id", probeId)
    .is("disabled_at", null)
    .maybeSingle();
  if (probe.error) throw new Error("probe lookup failed");
  if (!probe.data) return null;

  return { probeId };
}
