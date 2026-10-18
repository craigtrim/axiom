// craigtrim/axiom#91: narrow panes expose the filter through their real overflow action.
import { expect, type Page } from "@playwright/test";

export async function hierarchyFilter(page: Page) {
  const pane = page.getByRole("region", {
    name: "Hierarchy panel",
    exact: true,
  });
  await expect(pane).toBeVisible();
  const field = pane.getByRole("textbox", {
    name: "Filter hierarchy",
    includeHidden: true,
  });
  if (!(await field.isVisible())) {
    await pane
      .getByRole("button", { name: "More actions", exact: true })
      .click();
    await pane
      .getByRole("menuitem", { name: "Filter hierarchy", exact: true })
      .click();
  }
  await expect(field).toBeVisible();
  return field;
}
