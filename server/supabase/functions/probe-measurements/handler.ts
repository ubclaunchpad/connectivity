// Request handling for POST /functions/v1/probe-measurements.
//
// The handler takes its identity check, storage, and clock as dependencies, so
// tests can run it against fakes. index.ts wires in the real ones.
//
// Order of checks: method, size, JSON shape, probe token, revision, metrics,
// then the write. The token is checked before the revision is looked up, so an
// unauthenticated caller learns nothing about which revisions exist.

import { errorResponse, jsonResponse } from "../_shared/http.ts";
import { PROBE_TOKEN_HEADER, type ProbeIdentity } from "../_shared/probe-auth.ts";
import {
  type Measurement,
  metricsMatchDefinition,
  parseMeasurement,
  sameMeasurement,
  type StoredMeasurement,
} from "./validate.ts";

export const MAX_BODY_BYTES = 64 * 1024;

export type InsertOutcome = "inserted" | "exists" | "unknown_revision";

export interface MeasurementStore {
  /** The revision's definition, or null if no such revision exists. */
  getRevisionDefinition(revisionId: string): Promise<{ definition: unknown } | null>;
  /** Inserts the row unless its ID already exists. Never updates a row. */
  insertIfAbsent(measurement: Measurement): Promise<InsertOutcome>;
  getMeasurement(id: string): Promise<StoredMeasurement | null>;
}

export interface HandlerDeps {
  /** Resolves to null for rejected credentials; throws if the check cannot run. */
  verifyProbe(probeId: string, token: string | null): Promise<ProbeIdentity | null>;
  store: MeasurementStore;
  now(): Date;
}

class BodyTooLarge extends Error {}

async function readBody(req: Request): Promise<Uint8Array> {
  const declared = Number(req.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new BodyTooLarge();
  if (!req.body) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = req.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
}

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "POST") {
      return errorResponse("method_not_allowed", { Allow: "POST" });
    }

    let bytes: Uint8Array;
    try {
      bytes = await readBody(req);
    } catch (error) {
      if (error instanceof BodyTooLarge) return errorResponse("payload_too_large");
      return errorResponse("invalid_request");
    }

    const measurement = parseMeasurement(parseJson(bytes), deps.now());
    if (!measurement) return errorResponse("invalid_request");

    try {
      let identity;
      try {
        identity = await deps.verifyProbe(
          measurement.probe_id,
          req.headers.get(PROBE_TOKEN_HEADER),
        );
      } catch {
        console.error("probe-measurements: identity check failed");
        return errorResponse("internal_error");
      }
      if (!identity || identity.probeId !== measurement.probe_id) {
        return errorResponse("unauthorized");
      }

      const revision = await deps.store.getRevisionDefinition(measurement.test_revision_id);
      if (!revision) return errorResponse("unknown_revision");

      if (
        measurement.status === "completed" &&
        !metricsMatchDefinition(measurement.result_data, revision.definition)
      ) {
        return errorResponse("invalid_request");
      }

      const outcome = await deps.store.insertIfAbsent(measurement);
      if (outcome === "inserted") return jsonResponse(201, { id: measurement.id });
      if (outcome === "unknown_revision") return errorResponse("unknown_revision");

      // The ID is taken. Accept only an exact repeat from the same probe, and
      // never reveal anything about the stored row.
      const existing = await deps.store.getMeasurement(measurement.id);
      if (!existing) {
        console.error("probe-measurements: existing row could not be read");
        return errorResponse("internal_error");
      }
      if (!sameMeasurement(existing, measurement)) return errorResponse("conflict");
      return jsonResponse(200, { id: measurement.id });
    } catch {
      console.error("probe-measurements: unexpected failure");
      return errorResponse("internal_error");
    }
  };
}
