import { nextDesktopVersion, parseReleaseBump } from "./desktop-release-version";
import { appendFileSync } from "node:fs";

const manifestPath = "apps/desktop/package.json";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function run(...command: string[]): string {
  const result = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.slice(0, 3).join(" ")} failed:\n${result.stdout.toString()}\n${result.stderr.toString()}`,
    );
  }
  return result.stdout.toString().trim();
}

function api<T>(path: string, fields?: Record<string, string>): T {
  const args = ["gh", "api", path];
  if (fields) {
    for (const [key, value] of Object.entries(fields)) args.push("-f", `${key}=${value}`);
  }
  // SAFETY: Callers specify the documented GitHub REST response for each endpoint.
  return JSON.parse(run(...args)) as T;
}

type PullRequest = {
  number: number;
  state: string;
  merged: boolean;
  merge_commit_sha: string | null;
  head: { sha: string };
  base: { ref: string };
};

function output(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (/[\r\n]/.test(value)) throw new Error(`Invalid output: ${key}`);
    appendFileSync(env("GITHUB_OUTPUT"), `${key}=${value}\n`);
  }
}

function versionAt(ref: string): string {
  // SAFETY: This is the committed desktop manifest, whose version is validated before bumping.
  return (JSON.parse(run("git", "show", `${ref}:${manifestPath}`)) as { version: string }).version;
}

function getPull(repo: string, branch: string): PullRequest | undefined {
  const owner = repo.split("/")[0];
  return api<PullRequest[]>(
    `repos/${repo}/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}&base=main`,
  )[0];
}

async function prepare(): Promise<void> {
  if (env("GITHUB_REF") !== "refs/heads/main") {
    throw new Error("Start desktop releases from main.");
  }
  const repo = env("GITHUB_REPOSITORY");
  // A rerun uses the same branch and version, including after a successful merge.
  const branch = `release/desktop-${env("GITHUB_RUN_ID")}`;
  run("git", "config", "user.name", "substrate-release[bot]");
  run("git", "config", "user.email", "substrate-release[bot]@users.noreply.github.com");
  run("git", "fetch", "origin", "main");
  const existing = getPull(repo, branch);
  const remoteBranch = run("git", "ls-remote", "--heads", "origin", branch);
  if (remoteBranch || existing?.merged) {
    run("git", "fetch", "origin", existing?.merged ? existing.head.sha : branch);
    run("git", "checkout", "-B", branch, "FETCH_HEAD");
    if (existing?.merged) {
      // Build the original source again if all jobs are rerun after a publish failure.
      run("git", "checkout", "--detach", existing.head.sha);
    } else {
      if (existing?.state === "closed")
        throw new Error("The release PR was closed without merging.");
      const currentVersion = versionAt("origin/main");
      const releaseVersion = versionAt("HEAD");
      const base = run("git", "merge-base", "HEAD", "origin/main");
      if (currentVersion !== versionAt(base)) {
        throw new Error(
          `main's desktop version changed while preparing ${releaseVersion}. Start a new release.`,
        );
      }
      run("git", "merge", "--no-edit", "origin/main");
      run("git", "push", "origin", `HEAD:refs/heads/${branch}`);
    }
  } else {
    const pending = api<Array<{ head: { ref: string } }>>(
      `repos/${repo}/pulls?state=open&base=main&per_page=100`,
    );
    if (pending.some((pull) => pull.head.ref.startsWith("release/desktop-"))) {
      throw new Error(
        "Another desktop release PR is open. Rerun that release or close its PR first.",
      );
    }
    run("git", "checkout", "-b", branch, "origin/main");
    // SAFETY: The desktop package manifest has a version field; the bump validates its value.
    const manifest = (await Bun.file(manifestPath).json()) as { version: string };
    manifest.version = nextDesktopVersion(manifest.version, parseReleaseBump(env("RELEASE_BUMP")));
    await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    run("bun", "install", "--lockfile-only", "--ignore-scripts");
    run("git", "add", manifestPath, "bun.lock");
    run(
      "git",
      "commit",
      "-m",
      `chore(desktop): release ${manifest.version}`,
      "-m",
      "Update the desktop app version and lockfile for the next Windows and macOS release.",
    );
    run("git", "push", "origin", `HEAD:refs/heads/${branch}`);
  }
  const version = versionAt("HEAD");
  let pull = getPull(repo, branch);
  if (!pull) {
    pull = api<PullRequest>(`repos/${repo}/pulls`, {
      head: branch,
      base: "main",
      title: `chore(desktop): release ${version}`,
      body: `Automated desktop release ${version}.\n\nBoth platform builds must succeed before this workflow merges and tags the source, then publishes the installers.\n\nWorkflow: ${env("GITHUB_SERVER_URL")}/${repo}/actions/runs/${env("GITHUB_RUN_ID")}`,
    });
  }
  output({
    version,
    sha: run("git", "rev-parse", "HEAD"),
    base: run("git", "rev-parse", "origin/main"),
    pr: String(pull.number),
  });
}

function finalize(): void {
  const repo = env("GITHUB_REPOSITORY");
  const sha = env("RELEASE_SHA");
  const version = env("VERSION");
  const tag = `v${version}`;
  const pullPath = `repos/${repo}/pulls/${env("RELEASE_PR")}`;
  let pull = api<PullRequest>(pullPath);
  if (pull.head.sha !== sha || pull.base.ref !== "main") {
    throw new Error("The release PR changed after the build. Rerun the workflow to rebuild.");
  }
  if (!pull.merged) {
    if (pull.state !== "open") throw new Error("The release PR is not open.");
    // SAFETY: gh pr view returns the explicitly requested statusCheckRollup array.
    const checks = JSON.parse(
      run("gh", "pr", "view", String(pull.number), "--repo", repo, "--json", "statusCheckRollup"),
    ) as { statusCheckRollup: unknown[] };
    if (checks.statusCheckRollup.length) {
      run("gh", "pr", "checks", String(pull.number), "--repo", repo, "--watch", "--fail-fast");
    }
    const main = api<{ object: { sha: string } }>(`repos/${repo}/git/ref/heads/main`);
    if (main.object.sha !== env("RELEASE_BASE")) {
      throw new Error(
        "main changed during the build. Rerun all jobs to merge main into the release branch and rebuild.",
      );
    }
    // GitHub enforces the repository's merge rules. Do not use an admin bypass.
    run(
      "gh",
      "api",
      "--method",
      "PUT",
      `${pullPath}/merge`,
      "-f",
      "merge_method=merge",
      "-f",
      `sha=${sha}`,
      "-f",
      `commit_title=chore(desktop): release ${version}`,
      "-f",
      `commit_message=Release desktop ${version} after both platform builds passed.`,
    );
    pull = api<PullRequest>(pullPath);
  }
  if (!pull.merged || !pull.merge_commit_sha)
    throw new Error("GitHub did not merge the release PR.");
  const built = api<{ tree: { sha: string } }>(`repos/${repo}/git/commits/${sha}`);
  const merged = api<{ tree: { sha: string } }>(
    `repos/${repo}/git/commits/${pull.merge_commit_sha}`,
  );
  if (built.tree.sha !== merged.tree.sha) {
    throw new Error("The merged source differs from the built source. Refusing to tag or publish.");
  }
  const tags = api<Array<{ ref: string; object: { sha: string } }>>(
    `repos/${repo}/git/matching-refs/tags/${tag}`,
  );
  const existing = tags.find((entry) => entry.ref === `refs/tags/${tag}`);
  if (existing && existing.object.sha !== pull.merge_commit_sha) {
    throw new Error(`${tag} already points to a different source commit.`);
  }
  if (!existing) {
    api(`repos/${repo}/git/refs`, { ref: `refs/tags/${tag}`, sha: pull.merge_commit_sha });
  }
  output({ sha: pull.merge_commit_sha });
}

if (import.meta.main) {
  switch (process.argv[2]) {
    case "prepare":
      await prepare();
      break;
    case "finalize":
      finalize();
      break;
    default:
      throw new Error("Expected prepare or finalize");
  }
}
