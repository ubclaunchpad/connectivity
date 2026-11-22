// POST /functions/v1/probe-check-in
//
// A probe sends its ID and device token. If they match an active credential on
// an enabled probe, the response says which test revision the probe should run
// and gives short-lived signed download paths plus SHA-256 hashes for the
// revision's script and definition files.
//
// Error codes and statuses are defined in ../_shared/http.ts. Secrets, tokens
// and signed links are never logged.

import { errorResponse, jsonResponse } from "../_shared/http.ts";
import {
  PROBE_TOKEN_HEADER,
  parseProbeId,
  verifyProbeToken,
} from "../_shared/probe-auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const REVISIONS_BUCKET = "test-revisions";
const SIGNED_URL_TTL_SECONDS = 300;
const STORAGE_PATH_PREFIX = "/storage/v1/";

async function readProbeId(req: Request): Promise<string | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  return parseProbeId((body as Record<string, unknown>).probe_id);
}

/**
 * Storage signs URLs against the function's internal SUPABASE_URL, which the
 * probe cannot reach. Keep only the path and query; the probe resolves them
 * against its own BACKEND_URL.
 */
function toBackendPath(signedUrl: string): string | null {
  try {
    const url = new URL(signedUrl);
    if (!url.pathname.startsWith(STORAGE_PATH_PREFIX)) return null;
    if (!url.searchParams.has("token")) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", { Allow: "POST" });
  }

  const probeId = await readProbeId(req);
  if (!probeId) return errorResponse("invalid_request");

  try {
    const client = createServiceClient();

    let identity;
    try {
      identity = await verifyProbeToken(
        client,
        probeId,
        req.headers.get(PROBE_TOKEN_HEADER),
      );
    } catch {
      console.error("probe-check-in: identity check failed");
      return errorResponse("internal_error");
    }
    if (!identity) return errorResponse("unauthorized");

    const probe = await client
      .from("probes")
      .select("desired_revision_id")
      .eq("id", identity.probeId)
      .maybeSingle();
    if (probe.error || !probe.data) {
      console.error("probe-check-in: assignment read failed");
      return errorResponse("assignment_read_failed");
    }

    const revisionId: string | null = probe.data.desired_revision_id;
    if (revisionId === null) return jsonResponse(200, { assignment: null });

    const revision = await client
      .from("test_revisions")
      .select("id, script_path, definition_path, script_sha256, definition_sha256")
      .eq("id", revisionId)
      .maybeSingle();
    if (revision.error || !revision.data) {
      console.error("probe-check-in: revision read failed");
      return errorResponse("assignment_read_failed");
    }
    const row = revision.data;

    const signed = await client.storage
      .from(REVISIONS_BUCKET)
      .createSignedUrls([row.script_path, row.definition_path], SIGNED_URL_TTL_SECONDS);
    const scriptPath = signed.data?.[0]?.error
      ? null
      : toBackendPath(signed.data?.[0]?.signedUrl ?? "");
    const definitionPath = signed.data?.[1]?.error
      ? null
      : toBackendPath(signed.data?.[1]?.signedUrl ?? "");
    if (signed.error || signed.data?.length !== 2 || !scriptPath || !definitionPath) {
      console.error("probe-check-in: signing failed");
      return errorResponse("signing_failed");
    }

    return jsonResponse(200, {
      assignment: {
        test_revision_id: row.id,
        script: { download_path: scriptPath, sha256: row.script_sha256 },
        definition: { download_path: definitionPath, sha256: row.definition_sha256 },
      },
    });
  } catch {
    console.error("probe-check-in: unexpected failure");
    return errorResponse("internal_error");
  }
});
