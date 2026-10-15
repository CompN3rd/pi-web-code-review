export type ReviewSource = "files" | "git-staged" | "git-unstaged" | "git-compare";
export type GitSource = Exclude<ReviewSource, "files">;

/** Frozen commit endpoints, retained with comments even when branch names move. */
export interface GitComparison {
  baseRef: string;
  headRef: string;
  mode: "merge-base" | "direct";
  base: string;
  head: string;
}

export function isRevision(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_][a-z0-9_./~^@{}-]{0,255}$/iu.test(value) && !value.includes("..");
}
export function isCommitId(value: unknown): value is string {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value);
}
export function isComparison(value: unknown): value is GitComparison {
  return record(value) && isRevision(value["baseRef"]) && isRevision(value["headRef"])
    && (value["mode"] === "merge-base" || value["mode"] === "direct")
    && isCommitId(value["base"]) && isCommitId(value["head"]);
}
export function parseComparison(value: unknown): GitComparison {
  if (!isComparison(value)) throw new Error("Invalid Git comparison");
  return value;
}
export function comparisonKey(comparison: GitComparison | undefined): string {
  return comparison === undefined ? "" : JSON.stringify([comparison.baseRef, comparison.headRef, comparison.mode, comparison.base, comparison.head]);
}

export const MAX_TEXT_LENGTH = 200_000;
export const MAX_FILES = 2_000;

export function isGitSource(value: unknown): value is GitSource {
  return value === "git-staged" || value === "git-unstaged" || value === "git-compare";
}

/** Relative, unambiguous paths. Git callers must also disable pathspec magic with --literal-pathspecs. */
export function isWorkspacePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4096
    && !/^[a-z]:/iu.test(value) && !value.startsWith("/") && !value.includes("\\")
    // eslint-disable-next-line no-control-regex -- Never pass controls to Git or persist ambiguous labels.
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_FILES || !value.every(isWorkspacePath)) {
    throw new Error("Invalid or oversized Git file list");
  }
  return value;
}

export function parseDiff(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH) throw new Error("Invalid or oversized Git diff");
  return value;
}
