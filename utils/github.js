/**
 * github.js — GitHub REST API wrapper
 *
 * Provides two operations against /repos/:owner/:repo/contents/:path
 *   • getFileContents  – check whether a file already exists (returns SHA if it does)
 *   • commitFile        – create or update a file
 */

const GITHUB_API = 'https://api.github.com';

/**
 * Build the standard headers for every GitHub request.
 * @param {string} token  GitHub PAT
 * @returns {HeadersInit}
 */
function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Check whether a file already exists at the given path.
 * @returns {{ exists: boolean, sha?: string }}
 */
async function getFileContents({ token, owner, repo, path, branch }) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
  const res = await fetch(url, { headers: headers(token) });

  if (res.status === 404) return { exists: false };
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`GitHub GET ${res.status}: ${body.message || res.statusText}`);
  }

  const data = await res.json();
  return { exists: true, sha: data.sha };
}

/**
 * Create or update a file on GitHub.
 * @param {object} opts
 * @param {string} opts.content   Raw file content (will be Base64-encoded)
 * @param {string} opts.message   Commit message
 * @param {string} [opts.sha]     Required when updating an existing file
 * @returns {{ commitSha: string, htmlUrl: string }}
 */
async function commitFile({ token, owner, repo, path, branch, content, message, sha }) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;

  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),   // UTF-8 → Base64
    branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`GitHub PUT ${res.status}: ${data.message || res.statusText}`);
  }

  const data = await res.json();
  return {
    commitSha: data.commit?.sha ?? '',
    htmlUrl: data.content?.html_url ?? '',
  };
}

/**
 * Verify that a token + owner/repo combination is valid.
 * @returns {{ ok: boolean, error?: string }}
 */
async function testConnection({ token, owner, repo }) {
  try {
    const url = `${GITHUB_API}/repos/${owner}/${repo}`;
    const res = await fetch(url, { headers: headers(token) });

    if (res.status === 401) return { ok: false, error: 'Authentication failed — check your token.' };
    if (res.status === 404) return { ok: false, error: 'Repository not found — check owner/repo.' };
    if (!res.ok) return { ok: false, error: `Unexpected ${res.status}: ${res.statusText}` };

    const data = await res.json();
    const canPush = data.permissions?.push === true;
    if (!canPush) return { ok: false, error: 'Token lacks push access to this repository.' };

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
