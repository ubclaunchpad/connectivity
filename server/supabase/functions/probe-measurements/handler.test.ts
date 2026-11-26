// Handler tests with a stand-in identity check and an in-memory store, so they
// run without the database or the real token check from #3.

import assert from "node:assert/strict";
import type { ProbeIdentity } from "../_shared/probe-auth.ts";
import {
  createHandler,
  type InsertOutcome,
  MAX_BODY_BYTES,
  type MeasurementStore,
} from "./handler.ts";
import type { Measurement, StoredMeasurement } from "./validate.ts";

const PROBE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_PROBE_ID = "99999999-9999-4999-8999-999999999999";
const REVISION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RUN_ID = "11111111-1111-4111-8111-111111111111";

const TOKENS: Record<string, string> = {
  "probe-token": PROBE_ID,
  "other-probe-token": OTHER_PROBE_ID,
};

const DEFINITIONS: Record<string, unknown> = {
  [REVISION_ID]: {
    test_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    metrics: {
      rtt_avg_ms: { type: "number", nullable: true },
      packet_loss_pct: { type: "number", nullable: false },
    },
  },
};

class FakeStore implements MeasurementStore {
  rows = new Map<string, StoredMeasurement & { received_at: string }>();
  clock = 0;

  getRevisionDefinition(revisionId: string) {
    const definition = DEFINITIONS[revisionId];
    return Promise.resolve(definition ? { definition } : null);
  }

  insertIfAbsent(m: Measurement): Promise<InsertOutcome> {
    if (this.rows.has(m.id)) return Promise.resolve("exists");
    if (!DEFINITIONS[m.test_revision_id]) return Promise.resolve("unknown_revision");
    // Store timestamps the way PostgREST returns them.
    const pg = (value: string) => new Date(value).toISOString().replace(".000Z", "+00:00");
    this.rows.set(m.id, {
      ...structuredClone(m),
      started_at: pg(m.started_at),
      finished_at: pg(m.finished_at),
      received_at: `t${++this.clock}`,
    });
    return Promise.resolve("inserted");
  }

  getMeasurement(id: string) {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve(null);
    const { received_at: _, ...stored } = row;
    return Promise.resolve(structuredClone(stored));
  }
}

function setup(options: { verifyThrows?: boolean } = {}) {
  const store = new FakeStore();
  const handler = createHandler({
    verifyProbe(probeId: string, token: string | null): Promise<ProbeIdentity | null> {
      if (options.verifyThrows) return Promise.reject(new Error("db down"));
      return Promise.resolve(token && TOKENS[token] === probeId ? { probeId } : null);
    },
    store,
    now: () => new Date("2026-11-09T21:00:00Z"),
  });
  return { store, handler };
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    id: RUN_ID,
    probe_id: PROBE_ID,
    test_revision_id: REVISION_ID,
    started_at: "2026-11-09T20:00:00Z",
    finished_at: "2026-11-09T20:00:05Z",
    status: "completed",
    result_code: 0,
    result_data: { rtt_avg_ms: 18.4, packet_loss_pct: 0 },
    location: null,
    ...overrides,
  };
}

function post(payload: unknown, token: string | null = "probe-token"): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) headers["X-Probe-Token"] = token;
  return new Request("http://localhost/probe-measurements", {
    method: "POST",
    headers,
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

async function expectResponse(response: Response, status: number, json: unknown) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), json);
}

Deno.test("saves a valid measurement and returns its ID", async () => {
  const { store, handler } = setup();
  await expectResponse(await handler(post(body())), 201, { id: RUN_ID });
  assert.equal(store.rows.size, 1);
  assert.equal(store.rows.get(RUN_ID)?.probe_id, PROBE_ID);
});

Deno.test("accepts Ping with null latency when every packet is lost", async () => {
  const { handler } = setup();
  const response = await handler(
    post(body({ result_data: { rtt_avg_ms: null, packet_loss_pct: 100 } })),
  );
  await expectResponse(response, 201, { id: RUN_ID });
});

Deno.test("saves failed and timed-out runs", async () => {
  const { handler } = setup();
  await expectResponse(
    await handler(post(body({ status: "failed", result_code: 2, result_data: {} }))),
    201,
    { id: RUN_ID },
  );
  const other = "22222222-2222-4222-8222-222222222222";
  await expectResponse(
    await handler(post(body({ id: other, status: "timeout", result_code: null, result_data: {} }))),
    201,
    { id: other },
  );
});

Deno.test("an identical repeat keeps the original row and receipt time", async () => {
  const { store, handler } = setup();
  await handler(post(body()));
  const original = structuredClone(store.rows.get(RUN_ID));

  // Same values, different formatting and key order.
  const repeat = body({
    id: RUN_ID.toUpperCase(),
    started_at: "2026-11-09T12:00:00-08:00",
    result_data: { packet_loss_pct: 0, rtt_avg_ms: 18.4 },
  });
  await expectResponse(await handler(post(repeat)), 200, { id: RUN_ID });
  assert.deepEqual(store.rows.get(RUN_ID), original);
  assert.equal(store.rows.size, 1);
});

Deno.test("changed data under the same ID is a conflict and changes nothing", async () => {
  const { store, handler } = setup();
  await handler(post(body()));
  const original = structuredClone(store.rows.get(RUN_ID));

  for (
    const changed of [
      body({ result_data: { rtt_avg_ms: 99, packet_loss_pct: 0 } }),
      body({ finished_at: "2026-11-09T20:00:06Z" }),
      body({ location: { latitude: 0, longitude: 0 } }),
      body({ status: "failed", result_code: null, result_data: {} }),
    ]
  ) {
    await expectResponse(await handler(post(changed)), 409, { error: "conflict" });
  }
  assert.deepEqual(store.rows.get(RUN_ID), original);
});

Deno.test("another probe reusing a run ID gets a conflict without the stored data", async () => {
  const { store, handler } = setup();
  await handler(post(body()));
  const original = structuredClone(store.rows.get(RUN_ID));

  const response = await handler(post(body({ probe_id: OTHER_PROBE_ID }), "other-probe-token"));
  await expectResponse(response, 409, { error: "conflict" });
  assert.deepEqual(store.rows.get(RUN_ID), original);
});

Deno.test("rejected credentials create no row", async () => {
  const { store, handler } = setup();
  for (const token of [null, "", "wrong-token", "other-probe-token"]) {
    await expectResponse(await handler(post(body(), token)), 401, { error: "unauthorized" });
  }
  assert.equal(store.rows.size, 0);
});

Deno.test("credentials are checked before the revision is looked up", async () => {
  const { handler } = setup();
  const unknownRevision = body({ test_revision_id: "00000000-0000-4000-8000-000000000000" });
  await expectResponse(await handler(post(unknownRevision, "wrong-token")), 401, {
    error: "unauthorized",
  });
});

Deno.test("an unknown revision is rejected and creates no row", async () => {
  const { store, handler } = setup();
  const response = await handler(
    post(body({ test_revision_id: "00000000-0000-4000-8000-000000000000" })),
  );
  await expectResponse(response, 422, { error: "unknown_revision" });
  assert.equal(store.rows.size, 0);
});

Deno.test("invalid metrics and invalid data create no row", async () => {
  const { store, handler } = setup();
  for (
    const payload of [
      body({ result_data: { rtt_avg_ms: 18.4 } }),
      body({ result_data: { rtt_avg_ms: 18.4, packet_loss_pct: null } }),
      body({ result_data: { rtt_avg_ms: 18.4, packet_loss_pct: 0, extra: 1 } }),
      body({ result_code: 1 }),
      body({ status: "failed", result_code: 1 }),
      body({ finished_at: "2026-11-09T19:00:00Z" }),
      body({ received_at: "2026-11-09T20:00:06Z" }),
      "{not json",
      "",
    ]
  ) {
    await expectResponse(await handler(post(payload)), 400, { error: "invalid_request" });
  }
  assert.equal(store.rows.size, 0);
});

Deno.test("rejects oversized bodies and other methods", async () => {
  const { store, handler } = setup();
  const big = JSON.stringify(body({ location: { latitude: 0, longitude: 0, pad: "x".repeat(MAX_BODY_BYTES) } }));
  await expectResponse(await handler(post(big)), 413, { error: "payload_too_large" });

  const response = await handler(new Request("http://localhost/probe-measurements"));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "POST");
  await response.body?.cancel();
  assert.equal(store.rows.size, 0);
});

Deno.test("a failing identity check is a server error, not a rejection", async () => {
  const { store, handler } = setup({ verifyThrows: true });
  await expectResponse(await handler(post(body())), 500, { error: "internal_error" });
  assert.equal(store.rows.size, 0);
});
