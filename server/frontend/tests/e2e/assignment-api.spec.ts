import { expect, test } from "@playwright/test";

test("assignment routes are unavailable outside development", async ({
  request,
}) => {
  for (const path of ["/api/probes", "/api/test-revisions"]) {
    expect((await request.get(path)).status()).toBe(404);
  }

  const response = await request.put(
    "/api/probes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/assignment",
    { data: { test_revision_id: null } },
  );
  expect(response.status()).toBe(404);
});
