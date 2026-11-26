import { expect, test } from "@playwright/test";

import {
  AssignmentNotFoundError,
  createAssignmentService,
  InvalidAssignmentInputError,
} from "../../server/assignments/service";
import type {
  AssignmentData,
  SaveAssignmentResult,
} from "../../server/assignments/types";

const probeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const revisionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function fakeData(saveResult: SaveAssignmentResult) {
  const saves: Parameters<AssignmentData["saveProbeAssignment"]>[0][] = [];
  const data: AssignmentData = {
    listProbes: async () => [],
    listTestRevisions: async () => [],
    saveProbeAssignment: async (input) => {
      saves.push(input);
      return saveResult;
    },
  };
  return { data, saves };
}

test("sets the 300-second interval and clears both assignment fields", async () => {
  const assigned = fakeData({
    kind: "saved",
    assignment: { testRevisionId: revisionId },
  });
  const assignedService = createAssignmentService(assigned.data);
  expect(await assignedService.setProbeAssignment(probeId, revisionId)).toEqual({
    testRevisionId: revisionId,
  });
  expect(assigned.saves[0]).toEqual({
    probeId,
    testRevisionId: revisionId,
    intervalSeconds: 300,
  });

  const cleared = fakeData({
    kind: "saved",
    assignment: { testRevisionId: null },
  });
  const clearedService = createAssignmentService(cleared.data);
  expect(await clearedService.setProbeAssignment(probeId, null)).toBeNull();
  expect(cleared.saves[0]).toEqual({
    probeId,
    testRevisionId: null,
    intervalSeconds: null,
  });
});

test("rejects invalid IDs before accessing data", async () => {
  const fake = fakeData({ kind: "probe_not_found" });
  const service = createAssignmentService(fake.data);

  await expect(service.setProbeAssignment("invalid", null)).rejects.toBeInstanceOf(
    InvalidAssignmentInputError,
  );
  await expect(
    service.setProbeAssignment(probeId, "invalid"),
  ).rejects.toBeInstanceOf(InvalidAssignmentInputError);
  expect(fake.saves).toHaveLength(0);
});

test("reports unknown probes and revisions", async () => {
  for (const result of [
    { kind: "probe_not_found" },
    { kind: "revision_not_found" },
  ] satisfies SaveAssignmentResult[]) {
    const fake = fakeData(result);
    const service = createAssignmentService(fake.data);
    await expect(
      service.setProbeAssignment(probeId, revisionId),
    ).rejects.toBeInstanceOf(AssignmentNotFoundError);
  }
});
