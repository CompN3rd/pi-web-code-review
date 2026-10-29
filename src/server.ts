import type { PiWebServerPlugin, ServerPluginActivationContext, ServerPluginPeerRequestContext } from "@jmfederico/pi-web/server-plugin-api";
import { isCommitId, isGitSource, isRevision, isWorkspacePath, MAX_FILES, MAX_TEXT_LENGTH, parseComparison, record } from "./protocol.js";

// Do not inherit the repository/index of the process hosting the daemon.
const gitEnvironment = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR", "GIT_DIR", "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY", "GIT_PREFIX", "GIT_QUARANTINE_PATH", "GIT_WORK_TREE",
];

export async function requestGit(execFile: ServerPluginActivationContext["execFile"], request: ServerPluginPeerRequestContext) {
  const { input, operation, workspace, signal } = request;
  if (!record(input) || !isGitSource(input["source"])) throw new Error("Invalid Git review source");
  if (operation !== "changes" && operation !== "diff" && operation !== "compare") throw new Error("Unknown review operation");
  const run = async (args: string[]) => {
    const result = await execFile({ file: "git", args: ["--literal-pathspecs", "-C", workspace.path, ...args], cwd: workspace.path, env: { GIT_OPTIONAL_LOCKS: "0" }, unsetEnv: gitEnvironment, signal, timeoutMs: 10_000 });
    if (result.exitCode !== 0 || result.signal !== null) throw new Error(`Git review failed: ${result.stderr.trim() || `exit ${String(result.exitCode)}`}`);
    if (result.stdoutTruncated || result.stderrTruncated) throw new Error("Git output exceeds the host limit; narrow the review");
    return result.stdout;
  };
  if (operation === "compare") {
    if (input["source"] !== "git-compare" || !isRevision(input["baseRef"]) || !isRevision(input["headRef"])
      || (input["mode"] !== "merge-base" && input["mode"] !== "direct")) throw new Error("Invalid comparison revisions or mode");
    const baseRef = input["baseRef"]; const headRef = input["headRef"]; const mode = input["mode"];
    const resolve = async (ref: string) => {
      const commit = (await run(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`])).trim();
      if (!isCommitId(commit)) throw new Error("Git returned an invalid commit ID");
      return commit;
    };
    const baseTip = await resolve(baseRef); const head = await resolve(headRef);
    const base = mode === "direct" ? baseTip : (await run(["merge-base", baseTip, head])).trim();
    if (!isCommitId(base)) throw new Error("Git returned an invalid merge base");
    return { baseRef, headRef, mode, base, head };
  }
  const comparison = input["source"] === "git-compare" ? parseComparison(input["comparison"]) : undefined;
  const path = input["path"];
  if (operation === "diff" && !isWorkspacePath(path)) throw new Error("Invalid workspace-relative review path");
  const args = ["diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--no-color", "--submodule=short", "--relative"];
  if (input["source"] === "git-staged") args.push("--cached");
  if (operation === "changes") args.push("--name-only", "-z");
  else {
    const context = input["context"] ?? 3;
    if (context !== "all" && (typeof context !== "number" || !Number.isInteger(context) || context < 0 || context > 1000)) {
      throw new Error("Invalid diff context");
    }
    args.push(`--unified=${context === "all" ? "2147483647" : String(context)}`);
  }
  if (comparison !== undefined) args.push(comparison.base, comparison.head);
  args.push("--");
  if (operation === "diff" && typeof path === "string") args.push(path);
  const output = await run(args);
  if (operation === "changes") {
    const paths = output.split("\0").filter((entry) => entry !== "");
    if (paths.length > MAX_FILES) throw new Error("Too many changed files; narrow the review");
    if (!paths.every(isWorkspacePath)) throw new Error("Git returned a filename this review plugin cannot safely address");
    return paths;
  }
  if (output.length > MAX_TEXT_LENGTH) throw new Error("Diff is too large to review inline");
  return output;
}

const plugin: PiWebServerPlugin = {
  apiVersion: 3,
  name: "Code Review",
  activate: ({ execFile }) => ({ peer: { request: (request) => requestGit(execFile, request) } }),
};
export default plugin;
