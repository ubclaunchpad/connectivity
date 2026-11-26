import { assignmentData } from "@/server/assignments/data";
import {
  AssignmentNotFoundError,
  createAssignmentService,
  InvalidAssignmentInputError,
} from "@/server/assignments/service";

const assignments = createAssignmentService(assignmentData);

/**
 * PUT /api/probes/:probeId/assignment
 *
 * Assigns a test revision to a probe, or clears its assignment when
 * `test_revision_id` is `null`.
 *
 * @param request JSON body containing only `test_revision_id` as a UUID or
 * `null`.
 * @param context Route parameters containing the probe UUID.
 * @returns The saved assignment, `400` for invalid input, `404` when unavailable
 * or not found, or `500` on failure.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ probeId: string }> },
) {
  // TODO: Replace this temporary development-only guard with authentication
  // and authorization once they are available.
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { probeId } = await context.params;
  try {
    const testRevisionId = await parseAssignmentRequest(request);
    const assignment = await assignments.setProbeAssignment(
      probeId,
      testRevisionId,
    );
    return Response.json({
      assignment: assignment
        ? { test_revision_id: assignment.testRevisionId }
        : null,
    });
  } catch (error) {
    if (error instanceof InvalidAssignmentInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AssignmentNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }

    console.error("Unable to save probe assignment", error);
    return Response.json(
      { error: "Unable to save assignment" },
      { status: 500 },
    );
  }
}

async function parseAssignmentRequest(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new InvalidAssignmentInputError("Expected a JSON body");
  }

  if (
    !body ||
    typeof body !== "object" ||
    Object.keys(body).length !== 1 ||
    !("test_revision_id" in body) ||
    (body.test_revision_id !== null &&
      typeof body.test_revision_id !== "string")
  ) {
    throw new InvalidAssignmentInputError(
      "Expected only test_revision_id, as a UUID or null",
    );
  }

  return body.test_revision_id;
}
