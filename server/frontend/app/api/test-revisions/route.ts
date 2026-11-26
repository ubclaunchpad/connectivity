import { assignmentData } from "@/server/assignments/data";
import { createAssignmentService } from "@/server/assignments/service";

const assignments = createAssignmentService(assignmentData);

/**
 * GET /api/test-revisions
 *
 * Lists the test revisions that can be assigned to probes.
 *
 * @returns A `test_revisions` array, `404` outside development, or `500` on
 * failure.
 */
export async function GET() {
  // TODO: Replace this temporary development-only guard with authentication
  // and authorization once they are available.
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    return Response.json({
      test_revisions: await assignments.listTestRevisions(),
    });
  } catch (error) {
    console.error("Unable to list test revisions", error);
    return Response.json(
      { error: "Unable to list test revisions" },
      { status: 500 },
    );
  }
}
