/**
 * path-builder.js — Resolves the target file path from active mode + config + submission metadata
 */

// ── Language → file extension map ───────────────────────────

const LANG_EXT = {
  python:      'py',
  python3:     'py',
  java:        'java',
  cpp:         'cpp',
  'c++':       'cpp',
  c:           'c',
  csharp:      'cs',
  javascript:  'js',
  typescript:  'ts',
  go:          'go',
  golang:      'go',
  ruby:        'rb',
  swift:       'swift',
  kotlin:      'kt',
  rust:        'rs',
  scala:       'scala',
  php:         'php',
  dart:        'dart',
  racket:      'rkt',
  erlang:      'erl',
  elixir:      'ex',
  sql:         'sql',
  mysql:       'sql',
  mssql:       'sql',
  oraclesql:   'sql',
  shell:       'sh',
  bash:        'sh',
  r:           'r',
  lua:         'lua',
};

/**
 * Resolve file extension from a LeetCode language string.
 * @param {string} lang  e.g. "python3", "cpp"
 * @returns {string}
 */
function langToExt(lang) {
  return LANG_EXT[(lang || '').toLowerCase()] || 'txt';
}

// ── Comment style per language ──────────────────────────────

const HASH_COMMENT   = ['python', 'python3', 'ruby', 'shell', 'bash', 'r'];
const DASH_COMMENT   = ['sql', 'mysql', 'mssql', 'oraclesql'];
// Everything else uses //

/**
 * Return the single-line comment prefix for a language.
 */
function commentPrefix(lang) {
  const l = (lang || '').toLowerCase();
  if (HASH_COMMENT.includes(l)) return '#';
  if (DASH_COMMENT.includes(l)) return '--';
  return '//';
}

// ── Header builder ──────────────────────────────────────────

/**
 * Build the header comment block prepended to every committed file.
 * @param {object} meta  Submission metadata from LeetCode
 * @returns {string}
 */
function buildHeader(meta) {
  const p = commentPrefix(meta.langSlug);
  const sep = `${p} ${'='.repeat(60)}`;
  const ts = new Date(meta.timestamp * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

  const lines = [
    sep,
    `${p} ${meta.questionId}. ${meta.title}`,
    `${p} Difficulty : ${meta.difficulty}`,
    `${p} Language   : ${meta.langName}`,
    `${p} Runtime    : ${meta.runtime} (beats ${Number(meta.runtimePercentile).toFixed(1)}%)`,
    `${p} Memory     : ${meta.memory} (beats ${Number(meta.memoryPercentile).toFixed(1)}%)`,
    `${p} Submitted  : ${ts}`,
    `${p} URL        : https://leetcode.com/problems/${meta.titleSlug}/`,
    sep,
    '',
  ];
  return lines.join('\n');
}

// ── Token substitution (Mode A) ─────────────────────────────

/**
 * Replace tokens in a template string with values derived from submission metadata.
 * @param {string} template  e.g. "leetcode/{difficulty}/{id}_{slug}.{ext}"
 * @param {object} meta      Submission metadata
 * @returns {string}
 */
function resolveTemplate(template, meta) {
  const d = new Date(meta.timestamp * 1000);
  const pad2 = (n) => String(n).padStart(2, '0');
  const pad4 = (n) => String(n).padStart(4, '0');

  const tokens = {
    '{year}':       String(d.getUTCFullYear()),
    '{month}':      pad2(d.getUTCMonth() + 1),
    '{day}':        pad2(d.getUTCDate()),
    '{difficulty}': (meta.difficulty || 'unknown').toLowerCase(),
    '{language}':   (meta.langSlug || 'unknown').toLowerCase(),
    '{id}':         pad4(meta.questionId),
    '{slug}':       meta.titleSlug || 'unknown',
    '{title}':      (meta.title || 'Unknown').replace(/\s+/g, '_'),
    '{ext}':        langToExt(meta.langSlug),
  };

  let result = template;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

// ── College Workflow (Mode B) ───────────────────────────────

/**
 * Build the file path for College Workflow mode.
 * @param {number} week  1–4
 * @param {number} day   1–5
 * @param {object} meta  Submission metadata
 * @returns {string}
 */
function resolveCollege(week, day, meta) {
  const pad4 = (n) => String(n).padStart(4, '0');
  const filename = `${pad4(meta.questionId)}_${meta.titleSlug}.${langToExt(meta.langSlug)}`;
  return `Week_${week}/Day_${day}/${filename}`;
}

// ── Main entry point ────────────────────────────────────────

/**
 * Resolve the full file path based on the active mode and config.
 * @param {object} config     Settings from chrome.storage.sync
 * @param {object} meta       Submission metadata
 * @param {object} [local]    Settings from chrome.storage.local (week/day for College mode)
 * @returns {string}
 */
function buildPath(config, meta, local = {}) {
  if (config.folder_mode === 'college') {
    return resolveCollege(local.last_week || 1, local.last_day || 1, meta);
  }
  return resolveTemplate(config.path_template || 'leetcode/{id}_{slug}.{ext}', meta);
}

/**
 * Build a commit message from the template.
 * @param {string} template  e.g. "Add {id}. {title} [{language}] - {date}"
 * @param {object} meta
 * @returns {string}
 */
function buildCommitMessage(template, meta) {
  const d = new Date(meta.timestamp * 1000);
  const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

  let msg = template || 'Add {id}. {title} [{language}] - {date}';
  const pad4 = (n) => String(n).padStart(4, '0');

  const tokens = {
    '{id}':         pad4(meta.questionId),
    '{title}':      meta.title || 'Unknown',
    '{language}':   meta.langName || meta.langSlug || 'unknown',
    '{slug}':       meta.titleSlug || 'unknown',
    '{difficulty}': (meta.difficulty || 'unknown').toLowerCase(),
    '{date}':       dateStr,
    '{ext}':        langToExt(meta.langSlug),
  };

  for (const [token, value] of Object.entries(tokens)) {
    msg = msg.replaceAll(token, value);
  }
  return msg;
}

/**
 * Generate a live preview of a template using dummy data.
 */
function previewTemplate(template) {
  const dummyMeta = {
    timestamp: 1709305328,        // 2024-03-01 14:22:08 UTC
    difficulty: 'Easy',
    langSlug: 'python3',
    langName: 'Python 3',
    questionId: 1,
    titleSlug: 'two-sum',
    title: 'Two Sum',
    runtime: '52 ms',
    runtimePercentile: 87.4,
    memory: '17.3 MB',
    memoryPercentile: 62.1,
  };
  return resolveTemplate(template, dummyMeta);
}
