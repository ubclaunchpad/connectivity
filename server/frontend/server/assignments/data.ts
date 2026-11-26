import { createSupabaseClient } from "@/server/supabase/client";

import type {
  AssignmentData,
  Probe,
  TestRevision,
} from "./types";

type RevisionRow = {
  id: string;
  test_id: string;
  version_number: number;
  test: { name: string };
};

type ProbeRow = {
  id: string;
  name: string;
  revision: RevisionRow | null;
};

const revisionColumns =
  "id,test_id,version_number,test:tests!test_revisions_test_id_fkey(name)";

export const assignmentData: AssignmentData = {
  async listProbes(): Promise<Probe[]> {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("probes")
      .select(
        `id,name,revision:test_revisions!probes_desired_revision_id_fkey(${revisionColumns})`,
      )
      .order("name")
      .order("id");

    if (error) throw error;

    return (data as unknown as ProbeRow[]).map((probe) => ({
      id: probe.id,
      name: probe.name,
      assignment: probe.revision
        ? {
            test_revision_id: probe.revision.id,
            test_name: probe.revision.test.name,
            version_number: probe.revision.version_number,
          }
        : null,
    }));
  },

  async listTestRevisions(): Promise<TestRevision[]> {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("test_revisions")
      .select(revisionColumns)
      .order("test_id")
      .order("version_number");

    if (error) throw error;

    return (data as unknown as RevisionRow[]).map((revision) => ({
      id: revision.id,
      test_id: revision.test_id,
      test_name: revision.test.name,
      version_number: revision.version_number,
    }));
  },

  async saveProbeAssignment(input) {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("probes")
      .update({
        desired_revision_id: input.testRevisionId,
        desired_interval_seconds: input.intervalSeconds,
      })
      .eq("id", input.probeId)
      .select("desired_revision_id")
      .maybeSingle();

    if (error?.code === "23503") return { kind: "revision_not_found" };
    if (error) throw error;
    if (!data) return { kind: "probe_not_found" };

    return {
      kind: "saved",
      assignment: { testRevisionId: data.desired_revision_id },
    };
  },
};
