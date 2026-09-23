// craigtrim/axiom#6: the installer that replaces the loose packaged folder.
const { version } = require("./package.json");
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
  files: ["dist/**/*", "!dist/**/*.map", "package.json"],
  extraResources: ["THIRD-PARTY-NOTICES.txt", "LICENSES.md"],
  asarUnpack: ["**/metadata/**"],
  directories: { output: "artifacts/installer", buildResources: "build" },
  electronVersion: require("./package.json").devDependencies.electron,
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
