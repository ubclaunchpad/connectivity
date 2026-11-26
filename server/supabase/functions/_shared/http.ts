// JSON response helpers shared by probe-facing Edge Functions.
//
// Every error body is {"error": "<code>"} with no message, so responses never
// echo request data and the probe can switch on a stable code.

const ERROR_STATUS = {
  invalid_request: 400,
  unauthorized: 401,
  method_not_allowed: 405,
  conflict: 409,
  payload_too_large: 413,
  unknown_revision: 422,
  internal_error: 500,
  assignment_read_failed: 500,
  signing_failed: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const BASE_HEADERS = {
  "Content-Type": "application/json",
  // Responses can carry signed download links, so never let anything cache them.
  "Cache-Control": "no-store",
};

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...headers },
  });
}

export function errorResponse(
  code: ErrorCode,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse(ERROR_STATUS[code], { error: code }, headers);
}
