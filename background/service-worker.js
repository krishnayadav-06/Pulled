/**
 * service-worker.js — Background service worker
 *
 * Receives messages from popup.js, orchestrates:
 *   1. Fetch submission from LeetCode (via leetcode.js)
 *   2. Build file path (via path-builder.js)
 *   3. Commit to GitHub (via github.js)
 */

importScripts('../utils/github.js', '../utils/leetcode.js', '../utils/path-builder.js');

// ── Helpers ─────────────────────────────────────────────────

/**
 * Load all config from storage.
 */
async function getConfig() {
  const sync = await chrome.storage.sync.get({
    github_token: '',
    github_owner: '',
    github_repo: '',
    github_branch: 'main',
    folder_mode: 'template',
    path_template: 'leetcode/{difficulty}/{id}_{slug}/solution.{ext}',
    commit_message_template: 'Add {id}. {title} [{language}] - {date}',
    skip_existing: true,
  });
  const local = await chrome.storage.local.get({
    last_week: 1,
    last_day: 1,
  });
  return { sync, local };
}

/**
 * Normalize the raw submission detail into the meta shape the path builder expects.
 */
function normalizeMeta(detail) {
  return {
    timestamp: Number(detail.timestamp),
    difficulty: detail.question.difficulty,
    langSlug: detail.lang.name,
    langName: detail.lang.verboseName,
    questionId: Number(detail.question.questionId),
    titleSlug: detail.question.titleSlug,
    title: detail.question.title,
    runtime: detail.runtime,
    runtimePercentile: detail.runtimePercentile,
    memory: detail.memory,
    memoryPercentile: detail.memoryPercentile,
    code: detail.code,
  };
}

/**
 * Commit a single submission to GitHub.
 * @returns {{ success: boolean, message: string, commitSha?: string }}
 */
async function commitSubmission(meta, config, localOverrides = {}) {
  const { sync } = config;
  const local = { ...config.local, ...localOverrides };

  const path = buildPath(sync, meta, local);
  const header = buildHeader(meta);
  const content = header + meta.code;
  const message = buildCommitMessage(sync.commit_message_template, meta);

  // Check if file already exists
  const existing = await getFileContents({
    token: sync.github_token,
    owner: sync.github_owner,
    repo: sync.github_repo,
    path,
    branch: sync.github_branch,
  });

  if (existing.exists && sync.skip_existing) {
    return { success: true, message: `Skipped (already exists): ${path}`, skipped: true };
  }

  const result = await commitFile({
    token: sync.github_token,
    owner: sync.github_owner,
    repo: sync.github_repo,
    path,
    branch: sync.github_branch,
    content,
    message,
    sha: existing.exists ? existing.sha : undefined,
  });

  // Persist last sync info
  await chrome.storage.local.set({
    last_sync: {
      question_slug: meta.titleSlug,
      timestamp: new Date().toISOString(),
      commit_sha: result.commitSha,
    },
  });

  return { success: true, message: `Committed: ${path}`, commitSha: result.commitSha };
}

// ── Message handler ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((err) => {
    sendResponse({ success: false, error: err.message });
  });
  return true; // keep the message channel open for async response
});

async function handleMessage(msg) {
  switch (msg.action) {
    case 'commit_by_slug':
      return handleCommitBySlug(msg);

    case 'fetch_by_date':
      return handleFetchByDate(msg);

    case 'commit_selected':
      return handleCommitSelected(msg);

    case 'test_connection':
      return handleTestConnection(msg);

    case 'check_leetcode':
      return { loggedIn: await isLoggedIn() };

    default:
      throw new Error(`Unknown action: ${msg.action}`);
  }
}

// ── Handlers ────────────────────────────────────────────────

async function handleCommitBySlug({ slug, week, day }) {
  const config = await getConfig();
  if (!config.sync.github_token) throw new Error('GitHub token not configured.');

  const detail = await fetchLatestAcceptedForSlug(slug);
  if (!detail) throw new Error(`No accepted submission found for "${slug}".`);

  const meta = normalizeMeta(detail);
  const localOverrides = {};
  if (config.sync.folder_mode === 'college') {
    localOverrides.last_week = week;
    localOverrides.last_day = day;
  }

  return commitSubmission(meta, config, localOverrides);
}

async function handleFetchByDate({ date }) {
  const submissions = await fetchSubmissionsByDate(date);
  return { success: true, submissions };
}

async function handleCommitSelected({ ids, week, day }) {
  const config = await getConfig();
  if (!config.sync.github_token) throw new Error('GitHub token not configured.');

  const results = [];
  for (const id of ids) {
    const detail = await fetchSubmissionDetail(id);
    const meta = normalizeMeta(detail);

    const localOverrides = {};
    if (config.sync.folder_mode === 'college') {
      localOverrides.last_week = week;
      localOverrides.last_day = day;
    }

    const result = await commitSubmission(meta, config, localOverrides);
    results.push(result);

    // Throttle: 1 req/s for GitHub rate limiting
    await new Promise((r) => setTimeout(r, 1000));
  }

  const committed = results.filter((r) => !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  return {
    success: true,
    message: `Done: ${committed} committed, ${skipped} skipped out of ${results.length} submissions.`,
    results,
  };
}

async function handleTestConnection(msg) {
  return testConnection({ token: msg.token, owner: msg.owner, repo: msg.repo });
}
