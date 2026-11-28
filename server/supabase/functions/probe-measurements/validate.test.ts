import assert from "node:assert/strict";
import {
  metricsMatchDefinition,
  parseMeasurement,
  sameMeasurement,
  type StoredMeasurement,
  timestampToMicros,
} from "./validate.ts";

const NOW = new Date("2026-11-09T21:00:00Z");

const PING_DEFINITION = {
  test_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  metrics: {
    rtt_avg_ms: { label: "Average latency", type: "number", unit: "ms", nullable: true },
    packet_loss_pct: { label: "Packet loss", type: "number", unit: "%", nullable: false },
  },
};

function sample(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    id: "11111111-1111-4111-8111-111111111111",
    probe_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    test_revision_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    started_at: "2026-11-09T20:00:00Z",
    finished_at: "2026-11-09T20:00:05Z",
    status: "completed",
    result_code: 0,
    result_data: { rtt_avg_ms: 18.4, packet_loss_pct: 0 },
    location: null,
    ...overrides,
  };
}

function without(key: string): Record<string, unknown> {
  const body = sample();
  delete body[key];
  return body;
}

Deno.test("accepts the ticket example and lowercases IDs", () => {
  const parsed = parseMeasurement(
    sample({ id: "11111111-1111-4111-8111-11111111111A" }),
    NOW,
  );
  assert.ok(parsed);
  assert.equal(parsed.id, "11111111-1111-4111-8111-11111111111a");
});

Deno.test("rejects bodies with missing, extra, or mistyped top-level fields", () => {
  for (
    const body of [
      null,
      [],
      "x",
      without("location"),
      without("result_code"),
      sample({ received_at: "2026-11-09T20:00:06Z" }),
      sample({ schema_version: 2 }),
      sample({ schema_version: "1" }),
      sample({ id: "not-a-uuid" }),
      sample({ probe_id: 7 }),
      sample({ test_revision_id: null }),
      sample({ status: "COMPLETED" }),
    ]
  ) {
    assert.equal(parseMeasurement(body, NOW), null, JSON.stringify(body));
  }
});

Deno.test("checks timestamp format, order, and clock skew", () => {
  assert.ok(parseMeasurement(
    sample({ started_at: "2026-11-09T12:00:00-08:00", finished_at: "2026-11-09T20:00:00.123456Z" }),
    NOW,
  ));
  assert.ok(parseMeasurement(
    sample({ started_at: "2026-11-09T21:04:59Z", finished_at: "2026-11-09T21:05:00Z" }),
    NOW,
  ));
  for (
    const overrides of [
      { started_at: "2026-11-09 20:00:00Z" },
      { started_at: "2026-11-09T20:00:00" },
      { started_at: "2026-02-30T20:00:00Z" },
      { started_at: "2026-11-09T24:00:00Z" },
      { finished_at: "2026-11-09T20:00:00.1234567Z" },
      { finished_at: "2026-11-09T19:59:59Z" },
      { finished_at: "2026-11-09T21:05:01Z" },
      { started_at: 1700000000 },
    ]
  ) {
    assert.equal(parseMeasurement(sample(overrides), NOW), null, JSON.stringify(overrides));
  }
});

Deno.test("timestampToMicros treats equal instants in different forms as equal", () => {
  assert.equal(
    timestampToMicros("2026-11-09T20:00:00Z"),
    timestampToMicros("2026-11-09T12:00:00.000000-08:00"),
  );
  assert.equal(
    timestampToMicros("2026-11-09T20:00:00.5Z"),
    timestampToMicros("2026-11-09T20:00:00.500000+00:00"),
  );
});

Deno.test("validates location", () => {
  assert.ok(parseMeasurement(sample({ location: { latitude: 49.26, longitude: -123.25 } }), NOW));
  assert.ok(parseMeasurement(
    sample({ location: { latitude: -90, longitude: 180, accuracy_m: 0 } }),
    NOW,
  ));
  for (
    const location of [
      [],
      {},
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: -181 },
      { latitude: "49", longitude: 0 },
      { latitude: 0, longitude: 0, accuracy_m: -1 },
      { latitude: 0, longitude: 0, city: "Synthetic" },
    ]
  ) {
    assert.equal(parseMeasurement(sample({ location }), NOW), null, JSON.stringify(location));
  }
});

Deno.test("completed runs need exit code 0", () => {
  assert.equal(parseMeasurement(sample({ result_code: 1 }), NOW), null);
  assert.equal(parseMeasurement(sample({ result_code: null }), NOW), null);
});

Deno.test("failed and timed-out runs need empty metrics and an integer or null code", () => {
  for (const status of ["failed", "timeout"]) {
    assert.ok(parseMeasurement(sample({ status, result_code: 2, result_data: {} }), NOW));
    assert.ok(parseMeasurement(sample({ status, result_code: null, result_data: {} }), NOW));
    assert.ok(parseMeasurement(sample({ status, result_code: -1, result_data: {} }), NOW));
    assert.equal(parseMeasurement(sample({ status, result_code: 1.5, result_data: {} }), NOW), null);
    assert.equal(parseMeasurement(sample({ status, result_code: "1", result_data: {} }), NOW), null);
    assert.equal(
      parseMeasurement(sample({ status, result_code: 2 ** 31, result_data: {} }), NOW),
      null,
    );
    assert.equal(parseMeasurement(sample({ status, result_code: 1 }), NOW), null);
  }
});

Deno.test("metrics must match the revision definition", () => {
  assert.ok(metricsMatchDefinition({ rtt_avg_ms: 18.4, packet_loss_pct: 0 }, PING_DEFINITION));
  // Ping latency is null when every packet is lost.
  assert.ok(metricsMatchDefinition({ rtt_avg_ms: null, packet_loss_pct: 100 }, PING_DEFINITION));

  for (
    const data of [
      {},
      { rtt_avg_ms: 18.4 },
      { rtt_avg_ms: 18.4, packet_loss_pct: 0, jitter_ms: 1 },
      { rtt_avg_ms: 18.4, packet_loss_pct: null },
      { rtt_avg_ms: "18.4", packet_loss_pct: 0 },
      { rtt_avg_ms: 18.4, packet_loss_pct: true },
    ]
  ) {
    assert.equal(metricsMatchDefinition(data, PING_DEFINITION), false, JSON.stringify(data));
  }
});

Deno.test("metrics fail closed on definitions without supported metrics", () => {
  assert.equal(metricsMatchDefinition({}, { test_id: "x" }), false);
  assert.equal(
    metricsMatchDefinition({ up: true }, { metrics: { up: { type: "boolean" } } }),
    false,
  );
  assert.ok(metricsMatchDefinition({}, { metrics: {} }));
});

Deno.test("sameMeasurement compares values, not formatting", () => {
  const submitted = parseMeasurement(sample(), NOW)!;
  const stored: StoredMeasurement = {
    ...submitted,
    started_at: "2026-11-09T20:00:00+00:00",
    finished_at: "2026-11-09T20:00:05+00:00",
    result_data: { packet_loss_pct: 0, rtt_avg_ms: 18.4 },
  };
  assert.ok(sameMeasurement(stored, submitted));
  assert.equal(sameMeasurement({ ...stored, result_data: { rtt_avg_ms: 18.5, packet_loss_pct: 0 } }, submitted), false);
  assert.equal(sameMeasurement({ ...stored, finished_at: "2026-11-09T20:00:06+00:00" }, submitted), false);
  assert.equal(sameMeasurement({ ...stored, probe_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, submitted), false);
});
