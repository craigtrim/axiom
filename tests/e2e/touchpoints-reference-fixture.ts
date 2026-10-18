// craigtrim/axiom#92: exercise the native service, worker and local model with recorded HTTP replies.
import { expect, _electron, type ElectronApplication } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Snapshot } from "../../src/shared/protocol";
import type { TouchpointResponse } from "../../src/shared/touchpoints";
import {
  parseWikipediaResponse,
  wikipediaEntityDirectory,
} from "../../src/main/wikipedia-client";
import { touchpointsFixture } from "../fixtures/touchpoints-visual/fixture";

export async function touchpointsMenu(app: ElectronApplication, id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
  }, id);
}
export async function launchTouchpoints(theme = "light", noModel = false) {
  const fixture = touchpointsFixture();
  await mkdir("artifacts/issue-92", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/issue-92/profile-"));
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({ version: 1, theme }),
  );
  const file = path.join(profile, "touchpoints.ttl");
  await writeFile(file, fixture.turtle);
  const cacheDirectory = path.join(
    profile,
    "cache",
    "wikipedia",
    wikipediaEntityDirectory(fixture.classIri),
  );
  await mkdir(cacheDirectory, { recursive: true });
  const cacheFile = path.join(
    cacheDirectory,
    "search-" +
      createHash("sha256")
        .update("journal article")
        .digest("hex")
        .slice(0, 10) +
      ".json",
  );
  await writeFile(
    cacheFile,
    JSON.stringify({
      format: 1,
      entityIri: fixture.classIri,
      query: "Journal Article",
      host: "en.wikipedia.org",
      fetchedAt: fixture.fetchedAt,
      result: parseWikipediaResponse(fixture.classResponse),
    }),
  );
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
  } as Record<string, string>;
  if (noModel)
    env.AXIOM_EMBEDDING_MODEL_DIR = path.join(profile, "missing-model");
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    args: [
      ".",
      "--force-device-scale-factor=2",
      "--disable-lcd-text",
      "--disable-gpu",
      "--force-color-profile=srgb",
    ],
    env,
  });
  const page = await app.firstWindow(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(
    ({ BrowserWindow, dialog, protocol }, { file, fixture }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setFocusable(false);
      win.unmaximize();
      win.setSize(1200, 910);
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: file + ".axiom",
      });
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      const state = { calls: [] as string[], reply: "normal", fixture };
      (globalThis as any).touchpointsFixture = state;
      protocol.handle("https", (request) => {
        const url = new URL(request.url);
        if (url.host !== "en.wikipedia.org")
          throw Error("Unexpected live request: " + url.host);
        state.calls.push(request.url);
        if (state.reply === "429")
          return new Response("Throttled", { status: 429 });
        if (state.reply === "503")
          return new Response("Unavailable", { status: 503 });
        if (state.reply === "empty")
          return Response.json({ batchcomplete: true });
        return Response.json(
          url.searchParams.get("gsrsearch") === "Marie Curie"
            ? fixture.individualResponse
            : state.reply === "refresh"
              ? fixture.refreshResponse
              : fixture.classResponse,
        );
      });
    },
    { file, fixture },
  );
  const state = () =>
    page.evaluate(() => window.axiom.request<Snapshot>("state"));
  await touchpointsMenu(app, "file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === fixture.classIri),
    )
    .toBe(true);
  let iri = fixture.classIri;
  const host = () =>
    page.locator(`[data-pane-id="touchpoints:${encodeURIComponent(iri)}"]`);
  const pane = () =>
    host().getByRole("region", { name: "Touchpoints", exact: true });
  const open = async (individual = false) => {
    iri = individual ? fixture.individualIri : fixture.classIri;
    await page.evaluate((iri) => window.axiom.request("select", { iri }), iri);
    await touchpointsMenu(app, "touchpoints.open");
    await expect(
      pane().getByRole("textbox", { name: "Wikipedia query" }),
    ).toHaveValue(individual ? "Marie Curie" : "Journal Article");
    if (!individual)
      await expect(pane().locator(".cand")).toHaveCount(20, { timeout: 30000 });
  };
  await open();
  const size = async (width = 898, height = 530) => {
    await host().evaluate(
      (el, { width, height }) =>
        Object.assign((el as HTMLElement).style, {
          position: "fixed",
          left: "24px",
          top: "72px",
          width: width + "px",
          height: height + "px",
          zIndex: "1000",
        }),
      { width, height },
    );
    await expect
      .poll(async () => Math.round((await host().boundingBox())!.width))
      .toBe(width);
    await expect(host()).toHaveAttribute(
      "data-pane-narrow",
      String(width < 600),
    );
  };
  await size();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const row = (name: string) =>
    pane().getByRole("listitem", { name, exact: true });
  const select = async (name: string) => {
    await row(name).getByRole("checkbox").click();
  };
  const relation = async (name: string, value: string) => {
    await row(name)
      .getByRole("combobox", { name: "Relationship for " + name, exact: true })
      .selectOption({ label: value });
  };
  const more = async (label: string) => {
    await pane()
      .getByRole("button", { name: "More actions", exact: true })
      .click();
    await page.getByRole("menuitem", { name: label, exact: true }).click();
  };
  const search = async (refresh = false) => {
    await pane()
      .getByRole("button", {
        name: refresh ? "Refresh" : "Search",
        exact: true,
      })
      .click();
    await expect(pane().locator(".body")).toHaveAttribute(
      "aria-busy",
      "false",
      { timeout: 20000 },
    );
  };
  const saved = () =>
    page.evaluate(
      ({ iri, query }) => window.axiom.touchpoints.saved({ iri, query }),
      {
        iri,
        query: iri === fixture.classIri ? "Journal Article" : "Marie Curie",
      },
    ) as Promise<TouchpointResponse | undefined>;
  const reply = async (value: string) => {
    await app.evaluate((_, value) => {
      (globalThis as any).touchpointsFixture.reply = value;
    }, value);
  };
  const calls = () =>
    app.evaluate(
      () => (globalThis as any).touchpointsFixture.calls.length as number,
    );
  return {
    app,
    page,
    host,
    pane,
    state,
    profile,
    file,
    cacheFile,
    fixture,
    errors,
    open,
    size,
    row,
    select,
    relation,
    more,
    search,
    saved,
    reply,
    calls,
  };
}
export type TouchpointsFixture = Awaited<ReturnType<typeof launchTouchpoints>>;
