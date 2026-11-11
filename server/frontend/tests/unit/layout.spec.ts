import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import RootLayout from "../../app/layout";

test("root layout sets the document language and renders children", () => {
  const html = renderToStaticMarkup(
    createElement(
      RootLayout,
      null,
      createElement("main", { id: "unit-child" }, "Hello from the unit test"),
    ),
  );

  expect(html).toContain('<html lang="en">');
  expect(html).toContain(
    '<body><main id="unit-child">Hello from the unit test</main></body>',
  );
});
