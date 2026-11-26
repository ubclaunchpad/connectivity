import { assignmentData } from "@/server/assignments/data";
import { createAssignmentService } from "@/server/assignments/service";

const assignments = createAssignmentService(assignmentData);

/**
 * GET /api/probes
 *
 * Lists the probes available for test assignment.
 *
 * @returns A `probes` array, `404` outside development, or `500` on failure.
 */
export async function GET() {
  // TODO: Replace this temporary development-only guard with authentication
  // and authorization once they are available.
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    return Response.json({ probes: await assignments.listProbes() });
  } catch (error) {
    console.error("Unable to list probes", error);
    return Response.json({ error: "Unable to list probes" }, { status: 500 });
  }
}
