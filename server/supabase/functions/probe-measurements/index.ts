// POST /functions/v1/probe-measurements
//
// A probe uploads the result of one script run. The X-Probe-Token header must
// match an active credential on the enabled probe named in the body. Valid
// results are saved once; an identical repeat returns the same ID, and changed
// data under an existing ID is a conflict.
//
// Statuses and error codes are listed in server/README.md and
// ../_shared/http.ts. Tokens, request bodies, and keys are never logged.

import { errorResponse } from "../_shared/http.ts";
import { verifyProbeToken } from "../_shared/probe-auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { createHandler } from "./handler.ts";
import { createSupabaseStore } from "./store.ts";

let handler: ((req: Request) => Promise<Response>) | undefined;

function getHandler(): (req: Request) => Promise<Response> {
  if (!handler) {
    const client = createServiceClient();
    handler = createHandler({
      verifyProbe: (probeId, token) => verifyProbeToken(client, probeId, token),
      store: createSupabaseStore(client),
      now: () => new Date(),
    });
  }
  return handler;
}

Deno.serve(async (req) => {
  try {
    return await getHandler()(req);
  } catch {
    console.error("probe-measurements: function is not configured");
    return errorResponse("internal_error");
  }
});
