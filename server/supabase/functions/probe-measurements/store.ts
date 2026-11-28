// Supabase-backed storage for measurement uploads. Uses the service-role
// client, the only role with access to these tables. Measurements are
// insert-only: an existing row is never updated.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import type { InsertOutcome, MeasurementStore } from "./handler.ts";
import type { Measurement, StoredMeasurement } from "./validate.ts";

const FOREIGN_KEY_VIOLATION = "23503";

const MEASUREMENT_COLUMNS = [
  "id",
  "schema_version",
  "probe_id",
  "test_revision_id",
  "started_at",
  "finished_at",
  "status",
  "result_code",
  "result_data",
  "location",
].join(", ");

export function createSupabaseStore(client: SupabaseClient): MeasurementStore {
  return {
    async getRevisionDefinition(revisionId) {
      const { data, error } = await client
        .from("test_revisions")
        .select("definition")
        .eq("id", revisionId)
        .maybeSingle();
      if (error) throw new Error("revision lookup failed");
      return data ? { definition: data.definition } : null;
    },

    async insertIfAbsent(measurement: Measurement): Promise<InsertOutcome> {
      // INSERT ... ON CONFLICT (id) DO NOTHING. received_at is left to the
      // column default so the server, not the probe, records receipt time.
      const { data, error } = await client
        .from("measurements")
        .upsert(measurement, { onConflict: "id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        if (error.code === FOREIGN_KEY_VIOLATION) return "unknown_revision";
        throw new Error("measurement insert failed");
      }
      return data.length > 0 ? "inserted" : "exists";
    },

    async getMeasurement(id) {
      const { data, error } = await client
        .from("measurements")
        .select(MEASUREMENT_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("measurement lookup failed");
      return data as StoredMeasurement | null;
    },
  };
}
