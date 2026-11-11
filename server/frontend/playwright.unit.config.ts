import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/unit",
  forbidOnly: !!process.env.CI,
  reporter: "list",
});
