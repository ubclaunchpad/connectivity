export type Assignment = {
  test_revision_id: string;
  test_name: string;
  version_number: number;
};

export type Probe = {
  id: string;
  name: string;
  assignment: Assignment | null;
};

export type TestRevision = {
  id: string;
  test_id: string;
  test_name: string;
  version_number: number;
};

export type SavedAssignment = {
  testRevisionId: string | null;
};

export type SaveAssignmentResult =
  | { kind: "saved"; assignment: SavedAssignment }
  | { kind: "probe_not_found" }
  | { kind: "revision_not_found" };

export type AssignmentData = {
  listProbes(): Promise<Probe[]>;
  listTestRevisions(): Promise<TestRevision[]>;
  saveProbeAssignment(input: {
    probeId: string;
    testRevisionId: string | null;
    intervalSeconds: number | null;
  }): Promise<SaveAssignmentResult>;
};
