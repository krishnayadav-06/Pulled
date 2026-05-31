/**
 * leetcode.js — LeetCode GraphQL query helpers
 *
 * All requests hit https://leetcode.com/graphql.
 * Authentication uses LEETCODE_SESSION + csrftoken cookies,
 * read directly via chrome.cookies (MV3 service worker has access).
 */

const GQL_URL = 'https://leetcode.com/graphql';

// ── Cookie helpers ──────────────────────────────────────────

/**
 * Read a cookie from leetcode.com by name.
 * @param {string} name
 * @returns {Promise<string|null>}
 */
async function getCookie(name) {
  const cookie = await chrome.cookies.get({ url: 'https://leetcode.com', name });
  return cookie?.value ?? null;
}

/**
 * Build headers for a LeetCode GraphQL request.
 * @returns {Promise<HeadersInit>}
 */
async function buildHeaders() {
  const session = await getCookie('LEETCODE_SESSION');
  const csrf = await getCookie('csrftoken');

  if (!session) throw new Error('LeetCode session cookie not found. Please log in to leetcode.com first.');

  const h = {
    'Content-Type': 'application/json',
    Cookie: `LEETCODE_SESSION=${session}; csrftoken=${csrf || ''}`,
    Referer: 'https://leetcode.com',
  };
  if (csrf) h['x-csrftoken'] = csrf;
  return h;
}

// ── GraphQL queries ─────────────────────────────────────────

const SUBMISSION_DETAIL_QUERY = `
query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    runtime
    runtimePercentile
    memory
    memoryPercentile
    code
    timestamp
    statusDisplay
    lang {
      name
      verboseName
    }
    question {
      title
      titleSlug
      difficulty
      questionId
    }
  }
}`;

const SUBMISSION_LIST_QUERY = `
query submissionList($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String) {
  submissionList(offset: $offset, limit: $limit, lastKey: $lastKey, questionSlug: $questionSlug) {
    lastKey
    hasNext
    submissions {
      id
      title
      titleSlug
      status
      statusDisplay
      lang
      runtime
      timestamp
      url
    }
  }
}`;

// ── Public helpers ──────────────────────────────────────────

/**
 * Execute a GraphQL query against LeetCode.
 */
async function gql(query, variables) {
  const headers = await buildHeaders();
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`LeetCode GraphQL ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`LeetCode GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

/**
 * Get full submission details by submission ID.
 * @param {number} submissionId
 */
async function fetchSubmissionDetail(submissionId) {
  const data = await gql(SUBMISSION_DETAIL_QUERY, { submissionId: Number(submissionId) });
  return data.submissionDetails;
}

/**
 * Get the list of submissions for a given question slug.
 * Only returns accepted submissions.
 * @param {string} questionSlug
 * @returns {Promise<Array>}  List of accepted submission summaries
 */
async function fetchSubmissionsBySlug(questionSlug) {
  const data = await gql(SUBMISSION_LIST_QUERY, {
    offset: 0,
    limit: 40,
    questionSlug,
  });

  const subs = data.submissionList?.submissions ?? [];
  return subs.filter((s) => s.statusDisplay === 'Accepted');
}

/**
 * Convenience: get the latest accepted submission's full details for a slug.
 * @param {string} questionSlug
 */
async function fetchLatestAcceptedForSlug(questionSlug) {
  const accepted = await fetchSubmissionsBySlug(questionSlug);
  if (accepted.length === 0) return null;

  // First element is the most recent
  return fetchSubmissionDetail(accepted[0].id);
}

/**
 * Fetch accepted submissions for a specific date (YYYY-MM-DD).
 * Paginates through all submissions and filters by date.
 * @param {string} dateStr  e.g. "2024-03-01"
 */
async function fetchSubmissionsByDate(dateStr) {
  const targetStart = new Date(dateStr + 'T00:00:00Z').getTime() / 1000;
  const targetEnd = new Date(dateStr + 'T23:59:59Z').getTime() / 1000;
  const results = [];
  let offset = 0;
  let lastKey = null;
  let hasNext = true;

  while (hasNext) {
    const data = await gql(SUBMISSION_LIST_QUERY, {
      offset,
      limit: 20,
      lastKey,
    });

    const page = data.submissionList;
    const subs = page?.submissions ?? [];

    for (const s of subs) {
      const ts = Number(s.timestamp);
      if (ts < targetStart) {
        // Submissions are newest-first; once we pass the target date, stop
        hasNext = false;
        break;
      }
      if (ts <= targetEnd && s.statusDisplay === 'Accepted') {
        results.push(s);
      }
    }

    if (hasNext) {
      hasNext = page?.hasNext ?? false;
      lastKey = page?.lastKey ?? null;
      offset += 20;
    }
  }

  return results;
}

/**
 * Check if the user is currently logged in to LeetCode.
 */
async function isLoggedIn() {
  const session = await getCookie('LEETCODE_SESSION');
  return !!session;
}
