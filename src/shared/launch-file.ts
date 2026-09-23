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
 * Windows and Linux deliver a launch path in argv, mixed in with Chromium switches and
 * the application directory of a development run. Matching on the extensions Axiom
 * opens keeps those out without relying on argument position.
 *
 * More than one argument can match. A handover from a second launch carries
 * --source-app-id, and a build that passes its value as a separate argument passes the
 * application id, which ends in ".axiom" the way a workspace does. The caller resolves
 * the candidates in order and prefers one that exists, which tells the two apart.
 */
export function launchCandidates(argv: readonly string[]) {
  return argv.slice(1).filter((argument) => {
    if (argument.startsWith("-")) return false;
    const dot = argument.lastIndexOf(".");
    return (
      dot > 0 &&
      openableExtensions.includes(argument.slice(dot + 1).toLowerCase())
    );
  });
}
