// #166: local delivery requires current CI evidence for this exact clean source.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export const repository = "craigtrim/axiom";
export const workflowPath = ".github/workflows/build.yml";
export async function command(file, args, cwd) {
  const { stdout } = await exec(file, args, {
    cwd,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout.trim();
}
export async function readSource(root, run = command) {
  let commit, tree, remote, status;
  try {
    commit = await run("git", ["rev-parse", "HEAD"], root);
    tree = await run("git", ["rev-parse", "HEAD^{tree}"], root);
    remote = await run("git", ["remote", "get-url", "origin"], root);
    status = await run(
      "git",
      ["status", "--porcelain", "--untracked-files=all"],
      root,
    );
  } catch {
    throw Error(
      "A clean Git checkout of craigtrim/axiom is required; source archives are not eligible.",
    );
  }
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{40}$/.test(tree))
    throw Error("Cannot establish the source commit and tree.");
  if (
    !/^(https:\/\/github\.com\/craigtrim\/axiom(?:\.git)?|git@github\.com:craigtrim\/axiom(?:\.git)?)$/.test(
      remote,
    )
  )
    throw Error("The origin remote must be craigtrim/axiom on GitHub.");
  if (status)
    throw Error(
      `Source ${commit} has tracked changes or untracked files. Commit or preserve them before delivery.`,
    );
  return { commit, tree };
}
export function requireSuccessfulRun(run, source, workflowId) {
  const url = `https://github.com/${repository}/actions/runs/${run?.id}`;
  if (
    !run ||
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    run.head_sha !== source.commit ||
    run.workflow_id !== workflowId ||
    run.path !== workflowPath ||
    run.head_repository?.full_name !== repository ||
    !["push", "pull_request", "workflow_dispatch"].includes(run.event) ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1 ||
    run.html_url !== url
  )
    throw Error(`CI identity could not be verified for ${source.commit}.`);
  if (run.status !== "completed" || run.conclusion !== "success")
    throw Error(
      `CI has not passed for ${source.commit}: ${run.status}/${run.conclusion ?? "pending"}. ${url}\nInspect the run and rerun all jobs after resolving the failure. The existing executable is unchanged.`,
    );
  return run;
}
export async function latestSuccessfulRun(source, api) {
  try {
    const user = await api("user");
    if (!user.login) throw Error("Authenticated GitHub identity is missing.");
    const workflow = await api(
      `repos/${repository}/actions/workflows/build.yml`,
    );
    if (
      workflow.path !== workflowPath ||
      workflow.state !== "active" ||
      !Number.isSafeInteger(workflow.id)
    )
      throw Error("Required workflow is missing or inactive.");
    const runs = [];
    for (let page = 1; ; page++) {
      const response = await api(
        `repos/${repository}/actions/workflows/${workflow.id}/runs?head_sha=${source.commit}&per_page=100&page=${page}`,
      );
      if (
        !Array.isArray(response.workflow_runs) ||
        !Number.isInteger(response.total_count) ||
        response.total_count < 0 ||
        response.total_count > 1000
      )
        throw Error("The complete workflow history cannot be verified.");
      runs.push(...response.workflow_runs);
      if (runs.length >= response.total_count) break;
      if (!response.workflow_runs.length || page >= 10)
        throw Error("Incomplete workflow history.");
    }
    if (!runs.length)
      throw Error(
        `No required CI run exists for ${source.commit}. Push this commit and let Electron desktop complete.`,
      );
    if (
      runs.some(
        (run) =>
          !Number.isSafeInteger(run.id) || run.head_sha !== source.commit,
      )
    )
      throw Error("Workflow history includes an unverifiable revision.");
    const latest = runs.reduce((a, b) => (a.id > b.id ? a : b));
    const current = await api(`repos/${repository}/actions/runs/${latest.id}`);
    if (current.id !== latest.id) throw Error("Workflow run identity changed.");
    return requireSuccessfulRun(current, source, workflow.id);
  } catch (error) {
    throw Error(
      `Build gate rejected source ${source.commit}: ${error.message}`,
      { cause: error },
    );
  }
}
export function sameEvidence(before, after) {
  if (
    before.id !== after.id ||
    before.run_attempt !== after.run_attempt ||
    before.head_sha !== after.head_sha
  )
    throw Error(
      "The latest CI run or attempt changed during download. Retry delivery after it completes.",
    );
}
export const candidateName = (run) => `axiom-candidate-${run.run_attempt}`;
