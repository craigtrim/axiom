// craigtrim/axiom#6: the installer that replaces the loose packaged folder.
const { version } = require("../package.json");
/**
 * Signing stays off until an Azure signing account exists. Supplying the four
 * variables below turns it on with no change to this file, and Entra ID credentials
 * come from the environment as Azure's own tooling expects. Without them the build
 * produces an unsigned installer, which Windows SmartScreen warns about.
 */
const azure = process.env.AXIOM_AZURE_SIGNING_ENDPOINT && {
  publisherName: process.env.AXIOM_AZURE_PUBLISHER_NAME ?? "Craig Trim",
  endpoint: process.env.AXIOM_AZURE_SIGNING_ENDPOINT,
  certificateProfileName: process.env.AXIOM_AZURE_CERTIFICATE_PROFILE,
  codeSigningAccountName: process.env.AXIOM_AZURE_SIGNING_ACCOUNT,
};
module.exports = {
  appId: "com.craigtrim.axiom",
  productName: "Axiom",
  copyright: "Craig Trim",
  // The build step has already bundled everything into dist, so nothing else ships.
  files: [
    "dist/**/*",
    "!dist/**/*.map",
    "package.json",
    "!node_modules/onnxruntime-node/bin/**/darwin/**/*",
    "!node_modules/onnxruntime-node/bin/**/linux/**/*",
    "!node_modules/onnxruntime-node/bin/**/win32/arm64/**/*",
  ],
  extraResources: [
    { from: "licenses/THIRD-PARTY-NOTICES.txt", to: "THIRD-PARTY-NOTICES.txt" },
    { from: "licenses/LICENSES.md", to: "LICENSES.md" },
    { from: "vendor/mutatoc", to: "mutatoc" },
    // craigtrim/axiom#207: the ontology service runs on its own verified Node build.
    { from: "vendor/node", to: "node" },
    // craigtrim/axiom#206: the installer edits PATH without NSIS string limits.
    { from: "build/update-user-path.ps1", to: "update-user-path.ps1" },
  ],
  extraFiles: [{ from: "build/bin", to: "bin" }],
  asarUnpack: [
    "**/metadata/**",
    "node_modules/onnxruntime-node/bin/**/*",
    "dist/main/domain-worker.cjs",
    "dist/main/domain-launcher.cjs",
    "dist/main/layout-worker.cjs",
    "dist/main/embedding-worker.cjs",
    "dist/main/query-worker.cjs",
    "node_modules/**/*",
  ],
  directories: { output: "artifacts/installer", buildResources: "build" },
  electronVersion: require("../package.json").devDependencies.electron,
  buildVersion: version,
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "assets/axiom.ico",
    executableName: "Axiom",
    ...(azure ? { azureSignOptions: azure } : {}),
  },
  nsis: {
    // Per-user keeps the install free of an elevation prompt. File associations are
    // written by build/installer.nsh rather than by the fileAssociations option,
    // which electron-builder emits only for a per-machine install.
    perMachine: false,
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Axiom",
    artifactName: "Axiom-Setup-${version}.${ext}",
    uninstallDisplayName: "Axiom ${version}",
    include: "build/installer.nsh",
    deleteAppDataOnUninstall: false,
  },
  publish: [{ provider: "github", owner: "craigtrim", repo: "axiom" }],
};
