// #165: a new store is broadcast before its native command finishes saving.
// #223: opened workspaces keep a file reference rather than a copied ontology.
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
          const session = JSON.parse(
            await readFile(path.join(profile, "last-session.json"), "utf8"),
          );
          const workspace =
            session.workspace ??
            JSON.parse(await readFile(session.workspacePath, "utf8"));
          // Referenced files retain their saved epoch; the worker assigns a new one on load.
          if (
            session.workspace
              ? workspace.datasetEpoch !== snapshot.datasetEpoch
              : session.format !== "axiom-session" ||
                session.version !== 2 ||
                !path.isAbsolute(session.workspacePath)
          )
            return null;
          return {
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
      ontology: snapshot.ontology,
      entities: catalog(snapshot.entities),
    });
}
