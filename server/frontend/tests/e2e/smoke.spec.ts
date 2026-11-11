import { expect, test } from "@playwright/test";

test("home page shows the Connectivity heading", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Connectivity" })).toBeVisible();
});

test("results page shows the Results heading", async ({ page }) => {
  await page.goto("/results");

  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
});
