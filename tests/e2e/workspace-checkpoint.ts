// #165: a new store is broadcast before its native command finishes saving.
import { expect, type ElectronApplication, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";

export async function waitWorkspaceCheckpoint(
  app: ElectronApplication,
  page: Page,
) {
  const profile = await app.evaluate(({ app }) => app.getPath("userData"));
  const snapshot = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  const catalog = (entities: { iri: string; name: string }[]) =>
    entities.map(({ iri, name }) => ({ iri, name }));
  await expect
    .poll(
      async () => {
        try {
          const { workspace } = JSON.parse(
            await readFile(path.join(profile, "last-session.json"), "utf8"),
          );
          return {
            datasetEpoch: workspace.datasetEpoch,
            ontology: workspace.ontology,
            entities: catalog(workspace.entities),
          };
        } catch {
          return null;
        }
      },
      { message: "Workspace command must finish its recovery checkpoint" },
    )
    .toEqual({
      datasetEpoch: snapshot.datasetEpoch,
      ontology: snapshot.ontology,
      entities: catalog(snapshot.entities),
    });
}
