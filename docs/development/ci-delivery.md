# CI validation and Windows delivery

Issue #166 moves packaged-application testing to GitHub-hosted Windows. Local
`npm run build:exe` and Craig's ignored PowerShell launcher use the same helper.
They download the executable that CI tested, verify its files, and run the 237
required local desktop cases before delivery. Those cases may display windows and
take focus. The [test allocation](quiet-testing.md) assigns every native case to
CI or the local desktop; all required coverage must pass.

## Deliver an executable

Use Node.js 22.12 or later, Git, and an authenticated GitHub CLI with access to
craigtrim/axiom and its Actions artifacts. The delivery helper uses Node's built-in
modules for download verification. The required local test stage also needs this
checkout's npm dependencies and the normal local test runtimes. Install dependencies
with `npm ci` when needed, then run these commands from a clean checkout:

```powershell
gh auth status
git status --short
npm run build:exe
```

Craig can also run D:\git\axiom\Build-Axiom-EXE.ps1. Close an Axiom instance running
from the output folder before replacing its files. The helper does not close it,
run the installer or publish a release. It rebuilds the current source and opens
test windows for the required local desktop group before replacing output files.

A successful delivery prints `BUILD VERIFIED` and the absolute paths. The usual
application is D:\git\axiom\artifacts\installer\win-unpacked\Axiom.exe, and the
installer is D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe. Keep the entire
`win-unpacked` directory together when running the portable application.

## Required evidence

The gate requires the latest run of `.github/workflows/build.yml` for the exact
local HEAD to be completed successfully. It inspects the run's current attempt.
A newer failure, cancellation, timeout or unfinished run blocks delivery even if
an older run succeeded. Missing runs, authentication/API failures, source archives,
tracked edits and untracked files also block delivery. Ignored generated outputs
and the ignored local PowerShell wrapper do not make the source dirty.

For a pull request, the receipt records both its candidate head commit and the
synthetic merge commit actually checked out by CI. The candidate must equal local
HEAD, and the tested merge tree must equal the local tree. After merging a PR,
the new default-branch commit needs its own successful run. A different revision
cannot borrow approval, even when it has the same tree.

CI runs its assigned native cases across eight separate Windows runners, with one
test at a time per runner and no prerequisite package job. An independent job runs
unit, type, documentation and delivery-gate checks, the early native regression
batch, packaging and the audit. Quiet qualification remains a separate required
job. Every job and all 237 local desktop cases must pass. The two native selections
are complementary; splitting the work does not reduce required coverage.

CI builds the package and runs all eight existing packaged checks, including both
MPNet semantic-search journeys. The other checks cover literal Find synonyms,
highlight editing with automatic analysis on and off, cross-pane label updates,
search without a model, and recovery after a forced exit. Checks must pass once
without retries or skips. CI also compares ASAR contents with the build output,
checks Mutatoc runtime files and licenses, and hashes every installer-directory
file. These packaged checks supplement the full source-mode suite.

Each candidate artifact is named `axiom-candidate-<attempt>`. Local delivery checks
its revision, tree, run and attempt, complete file inventory, byte sizes and SHA-256
hashes. It rechecks the latest CI result and clean source after download. The
application embeds a build timestamp, so delivery retains the tested binary
instead of recompiling different bytes on the local machine.

The current receipt is `artifacts/build-exe/receipt.json`. It records source and
checkout commits, tree, workflow path, run URL/ID/attempt/conclusion, packaged
checks, local desktop validation and file hashes. Local evidence includes the
source commit/tree, a fresh validation ID, all 237 passing cases and the result-file
hash. Missing, stale, skipped, retried or failed local results block delivery.
`artifacts/latest-electron.json` retains local output paths.
Gate, download or verification failures leave the previous executable and receipt
intact. File replacement uses backups and rollback; a locked file stops delivery.
A crash can leave `artifacts/build-exe/delivery.lock`. Remove that file only after
confirming no delivery process is still running.

`npm run package` remains the lower-level packaging command used by CI. It does
not establish verified delivery and does not produce a successful delivery receipt.
Use `npm run build:exe` for the checked executable.

## Dependency audit

The last check in the `package` job is `npm run check:audit` (craigtrim/axiom#193). It runs `npm audit --omit=dev` and fails on any advisory of moderate severity or higher in a production dependency, with no exceptions. It then audits the full tree, build tools included, and fails on any advisory of moderate severity or higher that is not on the accepted list in `scripts/dependency-audit.mjs`. A report npm cannot produce, for example when the registry does not answer, also fails the check.

An accepted advisory passes only when every vulnerable copy reaches the project through `electron-builder` or `@electron/packager`, the two tools that run only while packaging. The check traces each copy through `package-lock.json` to the direct dependencies that install it. A copy reached through any other dependency fails the check, and so does one the lockfile cannot trace. Electron counts as shipped even though it is a devDependency, because its runtime is part of the executable, so an advisory that reaches Electron can never be accepted.

Each accepted entry names the advisory, its package and the reason the packaging tools cannot trigger it. The list holds two advisories published on 2026-10-30: GHSA-3g3m-2fjr-6pw4 for glob and GHSA-g3hv-75wg-m249 for minimatch. On 2026-10-31 no released version of either packaging tool used a patched copy, and forcing one with `overrides` breaks packaging: minimatch 10 and 11 have no default export, which `@electron/asar` 3.4.1 calls. Add an entry only through an issue that records the assessment. When an accepted advisory stops failing the audit, the check prints a warning to remove it and still passes.

## Diagnose and retry

Open the run linked in `BUILD FAILED`, or list recent runs:

```powershell
gh run list --repo craigtrim/axiom --workflow build.yml
gh run view RUN_ID --repo craigtrim/axiom --log-failed
gh run view RUN_ID --repo craigtrim/axiom --web
```

A runner losing contact is incomplete validation. It blocks delivery until a new
attempt succeeds. The existing executable remains available. Logs, Playwright
reports and failure traces are uploaded when the runner can finish the upload;
a runner that disappears cannot guarantee those artifacts.

Fix a source failure in a new commit and push the issue branch/PR. For an
infrastructure interruption, missing artifact or expired seven-day artifact,
rerun **all jobs** of the latest run for the same revision:

```powershell
gh run rerun RUN_ID --repo craigtrim/axiom
gh run watch RUN_ID --repo craigtrim/axiom
npm run build:exe
```

A partial rerun may leave only the previous attempt's package. That artifact is
rejected, even if the workflow later turns green. Rerun all jobs to produce and
verify a candidate for the current attempt. The helper runs the assigned local desktop group once for each delivery attempt.
It does not retry failures or fall back to an older successful run.

## Notifications and runner usage

In GitHub **Settings > Notifications > System > Actions**, choose **Email** or
**On GitHub**. Select **Only notify for failed workflows** if desired and save.
GitHub documents these settings for repositories you watch; enable the appropriate
watch notifications for Axiom. These are personal settings and this implementation
does not enable them for you. See [GitHub's Actions notification instructions](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications).

The public repository uses standard `windows-latest` runners. GitHub currently
provides [free standard hosted-runner usage for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
No larger paid runners are configured. Candidate packages and diagnostic artifacts
have seven-day retention; quiet qualification keeps its small evidence artifact.
Push runs are limited to `master`; PR and manual runs remain available. New runs
cancel obsolete runs for the same branch or PR.

## Non-UI verification

`npm run test:ci-delivery` exercises current and stale runs, failure states, source
identity, artifact corruption, missing files and rollback using controlled API
responses and temporary files. It also verifies rejection of incomplete or stale
local results without opening application windows. Hosted CI supplies packaged
and assigned native evidence; the local desktop runner supplies the remaining
required native evidence.

The same command checks the dependency audit rule against reports and lockfile trees shaped like npm's own. The accepted advisories pass when they arrive through the packaging tools. A new advisory fails, as does a production advisory, an accepted advisory reached through any other dependency, a copy the lockfile cannot trace and an npm error. A stale entry only warns.
