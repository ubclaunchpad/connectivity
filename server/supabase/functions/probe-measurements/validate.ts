// Validation for measurement uploads. Pure functions with no I/O, so they can
// be tested without a database. Every failure is reported as a bare `false` or
// `null`; callers answer with a generic error code and never echo the input.

export const SCHEMA_VERSION = 1;
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const STATUSES = ["completed", "failed", "timeout"] as const;
export type MeasurementStatus = (typeof STATUSES)[number];

const MEASUREMENT_KEYS = [
  "schema_version",
  "id",
  "probe_id",
  "test_revision_id",
  "started_at",
  "finished_at",
  "status",
  "result_code",
  "result_data",
  "location",
] as const;

const LOCATION_REQUIRED_KEYS = ["latitude", "longitude"];
const LOCATION_OPTIONAL_KEYS = ["accuracy_m"];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// RFC 3339 date-time with a required offset. Fractions stop at microseconds,
// the precision Postgres stores, so a repeated upload compares exactly.
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;

export type JsonObject = Record<string, unknown>;

export interface Location {
  latitude: number;
  longitude: number;
  accuracy_m?: number;
}

export interface Measurement {
  schema_version: number;
  id: string;
  probe_id: string;
  test_revision_id: string;
  started_at: string;
  finished_at: string;
  status: MeasurementStatus;
  result_code: number | null;
  result_data: JsonObject;
  location: Location | null;
}

export function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: JsonObject,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  if (!required.every((key) => Object.hasOwn(value, key))) return false;
  return keys.every((key) => required.includes(key) || optional.includes(key));
}

function parseUuid(value: unknown): string | null {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Returns the instant as microseconds since the Unix epoch, or null if the
 * value is not an RFC 3339 timestamp with an offset. Also accepts the
 * `+00:00` form that PostgREST returns, so stored and submitted values can be
 * compared exactly.
 */
export function timestampToMicros(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;

  const [, y, mo, d, h, mi, s, fraction = "", offset] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (year < 1 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  let offsetMinutes = 0;
  if (offset !== "Z") {
    const offsetHours = Number(offset.slice(1, 3));
    const offsetMins = Number(offset.slice(4, 6));
    if (offsetHours > 23 || offsetMins > 59) return null;
    offsetMinutes = (offsetHours * 60 + offsetMins) * (offset[0] === "-" ? -1 : 1);
  }

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  const epochSeconds = BigInt(date.getTime() / 1000 - offsetMinutes * 60);
  return epochSeconds * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
}

export function parseLocation(value: unknown): Location | null | undefined {
  if (value === null) return null;
  if (!isPlainObject(value)) return undefined;
  if (!hasExactKeys(value, LOCATION_REQUIRED_KEYS, LOCATION_OPTIONAL_KEYS)) {
    return undefined;
  }
  const { latitude, longitude, accuracy_m } = value;
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) return undefined;
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) return undefined;
  if (accuracy_m !== undefined && (!isFiniteNumber(accuracy_m) || accuracy_m < 0)) {
    return undefined;
  }
  return value as unknown as Location;
}

function isResultCode(value: unknown): value is number {
  return Number.isInteger(value) &&
    (value as number) >= INT4_MIN &&
    (value as number) <= INT4_MAX;
}

/**
 * Checks everything that does not depend on the revision: field set, IDs,
 * timestamps, location, and the status/result rules. Returns the measurement
 * with lowercase UUIDs, or null if anything is invalid.
 */
export function parseMeasurement(body: unknown, now: Date): Measurement | null {
  if (!isPlainObject(body) || !hasExactKeys(body, MEASUREMENT_KEYS)) return null;

  if (body.schema_version !== SCHEMA_VERSION) return null;

  const id = parseUuid(body.id);
  const probeId = parseUuid(body.probe_id);
  const revisionId = parseUuid(body.test_revision_id);
  if (!id || !probeId || !revisionId) return null;

  const startedAt = timestampToMicros(body.started_at);
  const finishedAt = timestampToMicros(body.finished_at);
  if (startedAt === null || finishedAt === null) return null;
  if (finishedAt < startedAt) return null;
  const latestAllowed = BigInt(now.getTime() + MAX_CLOCK_SKEW_MS) * 1000n;
  if (startedAt > latestAllowed || finishedAt > latestAllowed) return null;

  const status = body.status;
  if (typeof status !== "string" || !STATUSES.includes(status as MeasurementStatus)) {
    return null;
  }

  const resultCode = body.result_code;
  const resultData = body.result_data;
  if (!isPlainObject(resultData)) return null;
  if (status === "completed") {
    if (resultCode !== 0) return null;
  } else {
    if (resultCode !== null && !isResultCode(resultCode)) return null;
    if (Object.keys(resultData).length !== 0) return null;
  }

  const location = parseLocation(body.location);
  if (location === undefined) return null;

  return {
    schema_version: SCHEMA_VERSION,
    id,
    probe_id: probeId,
    test_revision_id: revisionId,
    started_at: body.started_at as string,
    finished_at: body.finished_at as string,
    status: status as MeasurementStatus,
    result_code: resultCode as number | null,
    result_data: resultData,
    location,
  };
}

/**
 * Checks a completed run's result_data against the revision's
 * `definition.metrics`. Keys must match exactly; values must be finite numbers,
 * or null only where the metric is declared `nullable: true`. Metric types
 * other than "number" are not supported yet and fail closed.
 */
export function metricsMatchDefinition(
  resultData: JsonObject,
  definition: unknown,
): boolean {
  if (!isPlainObject(definition) || !isPlainObject(definition.metrics)) return false;
  const metrics = definition.metrics;

  const metricNames = Object.keys(metrics);
  if (!hasExactKeys(resultData, metricNames)) return false;

  return metricNames.every((name) => {
    const metric = metrics[name];
    if (!isPlainObject(metric) || metric.type !== "number") return false;
    const value = resultData[name];
    if (value === null) return metric.nullable === true;
    return isFiniteNumber(value);
  });
}

/** JSON with object keys sorted, so equal JSON values compare as equal strings. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    const entries = Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface StoredMeasurement {
  id: string;
  schema_version: number;
  probe_id: string;
  test_revision_id: string;
  started_at: string;
  finished_at: string;
  status: string;
  result_code: number | null;
  result_data: unknown;
  location: unknown;
}

/** True when a stored row holds exactly the values of a submitted measurement. */
export function sameMeasurement(
  stored: StoredMeasurement,
  submitted: Measurement,
): boolean {
  return stored.id === submitted.id &&
    stored.schema_version === submitted.schema_version &&
    stored.probe_id === submitted.probe_id &&
    stored.test_revision_id === submitted.test_revision_id &&
    timestampToMicros(stored.started_at) === timestampToMicros(submitted.started_at) &&
    timestampToMicros(stored.finished_at) === timestampToMicros(submitted.finished_at) &&
    stored.status === submitted.status &&
    stored.result_code === submitted.result_code &&
    canonicalJson(stored.result_data) === canonicalJson(submitted.result_data) &&
    canonicalJson(stored.location) === canonicalJson(submitted.location);
}
