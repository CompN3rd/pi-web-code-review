import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import type { ServerPluginActivationContext, ServerPluginPeerRequestContext } from "@jmfederico/pi-web/server-plugin-api";
import { requestGit } from "../src/server.js";
import { parseComparison, type GitComparison } from "../src/protocol.js";
import { anchorInSnapshot, reviewMarkdown, snapshot, type Comment } from "../src/browser/model.js";
import { reviewStorage } from "./storageSupport.js";

const base = "a".repeat(40); const head = "b".repeat(40); const ancestor = "c".repeat(40);
const comparison = { baseRef: "main", headRef: "HEAD", mode: "merge-base" as const, base, head };
const success = { exitCode: 0, signal: null, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false };
function request(input: ServerPluginPeerRequestContext["input"], operation = "compare", path = "/repo"): ServerPluginPeerRequestContext {
  return { operation, input, project: { id: "p", name: "P", path }, workspace: { id: "w", projectId: "p", path, label: "main", isMain: true }, signal: new AbortController().signal };
}

describe("revision comparisons", () => {
  it.each(["merge-base", "direct"] as const)("resolves safe immutable commit endpoints for %s", async (mode) => {
    const exec = vi.fn<ServerPluginActivationContext["execFile"]>()
      .mockResolvedValueOnce({ ...success, stdout: `${base}\n` })
      .mockResolvedValueOnce({ ...success, stdout: `${head}\n` })
      .mockResolvedValueOnce({ ...success, stdout: `${ancestor}\n` });
    const input = request({ source: "git-compare", baseRef: "origin/main", headRef: "HEAD~3", mode });
    const resolved = parseComparison(await requestGit(exec, input));
    expect(resolved).toEqual({ baseRef: "origin/main", headRef: "HEAD~3", mode, base: mode === "direct" ? base : ancestor, head });
    expect(exec.mock.calls[0]?.[0].args).toEqual(["--literal-pathspecs", "-C", "/repo", "rev-parse", "--verify", "--end-of-options", "origin/main^{commit}"]);
    expect(exec.mock.calls[1]?.[0].args).toContain("HEAD~3^{commit}");
    expect(exec).toHaveBeenCalledTimes(mode === "direct" ? 2 : 3);
    for (const [call] of exec.mock.calls) {
      expect(call.cwd).toBe("/repo"); expect(call.signal).toBe(input.signal);
      expect(call.unsetEnv).toContain("GIT_DIR");
    }
    exec.mockReset().mockResolvedValue({ ...success, stdout: "a.ts\0" });
    await requestGit(exec, request({ source: "git-compare", comparison: { ...resolved } }, "changes"));
    expect(exec.mock.lastCall?.[0].args).toEqual(expect.arrayContaining([resolved.base, resolved.head, "--"]));
  });
  it.each(["--output=bad", "main..HEAD", "HEAD:a.ts", "a b", "$(touch nope)", "a\nHEAD", "a".repeat(257), ""])("rejects unsafe or ambiguous revision %j before execution", async (baseRef) => {
    const exec = vi.fn<ServerPluginActivationContext["execFile"]>();
    await expect(requestGit(exec, request({ source: "git-compare", baseRef, headRef: "HEAD", mode: "direct" }))).rejects.toThrow("Invalid comparison");
    expect(exec).not.toHaveBeenCalled();
  });
  it("fails closed for invalid modes, missing frozen endpoints, and failed or malformed Git resolution", async () => {
    const exec = vi.fn<ServerPluginActivationContext["execFile"]>();
    await expect(requestGit(exec, request({ source: "git-compare", baseRef: "main", headRef: "HEAD", mode: "invalid" }))).rejects.toThrow("Invalid comparison");
    await expect(requestGit(exec, request({ source: "git-compare" }, "changes"))).rejects.toThrow("Invalid Git comparison");
    await expect(requestGit(exec, request({ source: "git-compare", comparison: { ...comparison, head: "--stat" }, path: "a.ts" }, "diff"))).rejects.toThrow("Invalid Git comparison");
    expect(exec).not.toHaveBeenCalled();
    exec.mockResolvedValue({ ...success, exitCode: 128, stderr: "unknown revision" });
    await expect(requestGit(exec, request({ source: "git-compare", baseRef: "missing", headRef: "HEAD", mode: "direct" }))).rejects.toThrow("unknown revision");
    exec.mockResolvedValue({ ...success, stdout: "not a commit" });
    await expect(requestGit(exec, request({ source: "git-compare", baseRef: "main", headRef: "HEAD", mode: "direct" }))).rejects.toThrow("invalid commit ID");
    exec.mockResolvedValue({ ...success, stdout: base, stdoutTruncated: true });
    await expect(requestGit(exec, request({ source: "git-compare", baseRef: "main", headRef: "HEAD", mode: "direct" }))).rejects.toThrow("host limit");
  });
  it("retains comparison identity in snapshots, saved comments, acknowledgement and Markdown", async () => {
    const text = "@@ -1 +1 @@\n-before\n+after\n";
    const first = snapshot("a.ts", "git-compare", text, comparison);
    const moved = { ...comparison, head: ancestor };
    const second = snapshot("a.ts", "git-compare", text, moved);
    const comment: Comment = { id: "c", path: "a.ts", source: "git-compare", comparison, side: "new", start: 1, end: 1, body: "Check this", hash: first.hash, createdAt: 1 };
    expect(first.hash).not.toBe(second.hash);
    expect(anchorInSnapshot(comment, first)).toBe(true);
    expect(anchorInSnapshot(comment, second)).toBe(false);
    const { store } = reviewStorage();
    await store.add("one", comment);
    expect(await store.load("one")).toEqual([comment]);
    const updated = { ...comment, comparison: moved };
    await store.update("one", updated);
    await store.removeUnchanged("one", [comment]);
    expect(await store.load("one")).toEqual([updated]);
    const markdown = reviewMarkdown([comment]);
    expect(markdown).toContain("main..."); expect(markdown).toContain("HEAD");
    expect(markdown).toContain(base.slice(0, 12)); expect(markdown).toContain(head.slice(0, 12));
    const missingComparison = { ...comment, id: "bad" }; delete missingComparison.comparison;
    await expect(store.add("one", missingComparison)).rejects.toThrow("Invalid review comment");
    await expect(store.add("one", { ...comment, id: "bad", comparison: { ...comparison, base: "main" } })).rejects.toThrow("Invalid review comment");
  });
});

it("reviews accumulated branch/commit work in a real divergent repository, excluding dirty index/worktree changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-comparison-"));
  try {
    const exec = promisify(nodeExecFile);
    const git = (...args: string[]) => exec("git", ["-C", root, ...args]);
    const commit = async (message: string) => {
      await git("add", ".");
      await git("-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-m", message);
    };
    await git("init", "-b", "main");
    await writeFile(join(root, "a.ts"), "base\n"); await commit("base");
    const initial = (await git("rev-parse", "HEAD")).stdout.trim();
    await git("checkout", "-b", "feature");
    await writeFile(join(root, "a.ts"), "feature\n"); await commit("first feature commit");
    await writeFile(join(root, "second.ts"), "second\n"); await commit("second feature commit");
    await git("branch", "review-target");
    await git("checkout", "main");
    await writeFile(join(root, "main-only.ts"), "main only\n"); await commit("diverged main");
    await git("checkout", "feature");
    await writeFile(join(root, "a.ts"), "staged\n"); await git("add", "a.ts");
    await writeFile(join(root, "a.ts"), "working\n");
    await writeFile(join(root, "untracked.ts"), "untracked\n");
    const adapter: ServerPluginActivationContext["execFile"] = async ({ file, args, signal }) => {
      const result = await exec(file, [...args ?? []], { signal });
      return { ...success, stdout: result.stdout, stderr: result.stderr };
    };
    const resolve = async (baseRef: string, headRef: string, mode: "direct" | "merge-base") => parseComparison(await requestGit(adapter, request({ source: "git-compare", baseRef, headRef, mode }, "compare", root)));
    const changes = (resolved: GitComparison) => requestGit(adapter, request({ source: "git-compare", comparison: { ...resolved } }, "changes", root));
    const branch = await resolve("main", "review-target", "merge-base");
    expect(branch.base).toBe(initial);
    expect(await changes(branch)).toEqual(["a.ts", "second.ts"]);
    const direct = await resolve("main", "HEAD", "direct");
    expect(await changes(direct)).toEqual(["a.ts", "main-only.ts", "second.ts"]);
    const recent = await resolve("HEAD~1", "HEAD", "direct");
    expect(await changes(recent)).toEqual(["second.ts"]);
    await git("update-ref", "refs/heads/review-target", "main");
    await git("update-ref", "refs/heads/main", branch.head);
    // Moving a named ref does not change the already-resolved file list or diff.
    expect(await changes(branch)).toEqual(["a.ts", "second.ts"]);
    const diff = await requestGit(adapter, request({ source: "git-compare", comparison: { ...branch }, path: "a.ts" }, "diff", root));
    expect(diff).toContain("+feature"); expect(diff).not.toContain("+working"); expect(diff).not.toContain("+staged");
    expect((await git("show", ":a.ts")).stdout).toBe("staged\n");
    expect(await resolve("main", "HEAD", "merge-base")).toMatchObject({ base: branch.head, head: branch.head });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 20_000);
