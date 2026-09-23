// craigtrim/axiom#1: the workspace path an operating system hands to Axiom at launch.
/** The extensions File > Open accepts, and the only ones a launch path may carry. */
export const openableExtensions = [
  "axiom",
  "ttl",
  "rdf",
  "owl",
  "xml",
  "nt",
  "nq",
  "trig",
  "jsonld",
];
/**
 * Switches whose value arrives as the following argument rather than after an equals
 * sign. Electron adds --source-app-id when a second launch hands its argv over, and
 * the application id it carries ends in ".axiom" like a workspace would.
 */
const switchesTakingAValue = ["--source-app-id"];
/**
 * Windows and Linux deliver a launch path in argv, mixed in with Chromium switches
 * and the application directory of a development run. Matching on the extensions
 * Axiom opens keeps those out without relying on argument position.
 */
export function launchPath(argv: readonly string[]) {
  return argv.slice(1).find((argument, index, all) => {
    if (argument.startsWith("-")) return false;
    if (switchesTakingAValue.includes(all[index - 1])) return false;
    const dot = argument.lastIndexOf(".");
    return (
      dot > 0 &&
      openableExtensions.includes(argument.slice(dot + 1).toLowerCase())
    );
  });
}
