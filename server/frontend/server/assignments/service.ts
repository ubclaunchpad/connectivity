import type { AssignmentData, SavedAssignment } from "./types";

const assignmentIntervalSeconds = 300;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidAssignmentInputError extends Error {}
export class AssignmentNotFoundError extends Error {}

export function createAssignmentService(data: AssignmentData) {
  return {
    listProbes: () => data.listProbes(),
    listTestRevisions: () => data.listTestRevisions(),

    async setProbeAssignment(
      probeId: string,
      testRevisionId: string | null,
    ): Promise<SavedAssignment | null> {
      if (!uuidPattern.test(probeId)) {
        throw new InvalidAssignmentInputError("Invalid probe ID");
      }
      if (testRevisionId !== null && !uuidPattern.test(testRevisionId)) {
        throw new InvalidAssignmentInputError("Invalid test revision ID");
      }

      const result = await data.saveProbeAssignment({
        probeId,
        testRevisionId,
        intervalSeconds:
          testRevisionId === null ? null : assignmentIntervalSeconds,
      });

      if (result.kind === "probe_not_found") {
        throw new AssignmentNotFoundError("Unknown probe");
      }
      if (result.kind === "revision_not_found") {
        throw new AssignmentNotFoundError("Unknown test revision");
      }

      return result.assignment.testRevisionId === null
        ? null
        : result.assignment;
    },
  };
}
