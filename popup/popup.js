/**
 * popup.js — Entry point for user-initiated syncs
 *
 * Reads config, adjusts UI for active mode, sends messages to service worker.
 */

// ── DOM refs ────────────────────────────────────────────────

const statusBadge    = document.getElementById('status-badge');
const statusText     = document.getElementById('status-text');
const lastSyncBar    = document.getElementById('last-sync-bar');
const lastSyncName   = document.getElementById('last-sync-name');
const lastSyncTime   = document.getElementById('last-sync-time');
const collegeSection = document.getElementById('college-selectors');
const weekSelect     = document.getElementById('week-select');
const daySelect      = document.getElementById('day-select');
const slugInput      = document.getElementById('slug-input');
const commitSlugBtn  = document.getElementById('commit-slug-btn');
const dateInput      = document.getElementById('date-input');
const commitDateBtn  = document.getElementById('commit-date-btn');
const dateResults    = document.getElementById('date-results');
const dateResultsList= document.getElementById('date-results-list');
const selectAllCb    = document.getElementById('select-all-cb');
const commitSelectedBtn = document.getElementById('commit-selected-btn');
const feedback       = document.getElementById('feedback');
const feedbackIcon   = document.getElementById('feedback-icon');
const feedbackText   = document.getElementById('feedback-text');
const optionsLink    = document.getElementById('options-link');

let currentSubmissions = []; // Store fetched submissions

// ── Init ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Set today as default date
  dateInput.value = new Date().toISOString().slice(0, 10);

  // Options link
  optionsLink.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Load config and adjust UI
  const config = await chrome.storage.sync.get({
    github_token: '',
    folder_mode: 'template',
  });

  // Connection status
  if (config.github_token) {
    statusBadge.className = 'badge badge-connected';
    statusText.textContent = 'Connected';
  } else {
    statusBadge.className = 'badge badge-disconnected';
    statusText.textContent = 'Not connected';
    commitSlugBtn.disabled = true;
    commitDateBtn.disabled = true;
  }

  // College mode UI
  if (config.folder_mode === 'college') {
    collegeSection.style.display = 'flex';
    const local = await chrome.storage.local.get({ last_week: 1, last_day: 1 });
    weekSelect.value = local.last_week;
    daySelect.value = local.last_day;
  }

  // Last sync info
  const { last_sync } = await chrome.storage.local.get('last_sync');
  if (last_sync) {
    lastSyncBar.style.display = 'flex';
    lastSyncName.textContent = last_sync.question_slug;
    lastSyncTime.textContent = timeAgo(new Date(last_sync.timestamp));
  }

  // Persist week/day on change
  weekSelect.addEventListener('change', () => {
    chrome.storage.local.set({ last_week: Number(weekSelect.value) });
  });
  daySelect.addEventListener('change', () => {
    chrome.storage.local.set({ last_day: Number(daySelect.value) });
  });

  // Actions
  commitSlugBtn.addEventListener('click', handleCommitBySlug);
  commitDateBtn.addEventListener('click', handleCommitByDate);
  commitSelectedBtn.addEventListener('click', handleCommitSelected);

  selectAllCb.addEventListener('change', (e) => {
    const cbs = dateResultsList.querySelectorAll('.sub-checkbox');
    cbs.forEach(cb => cb.checked = e.target.checked);
  });

  // Enter key on slug input
  slugInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCommitBySlug();
  });
}

// ── Handlers ────────────────────────────────────────────────

async function handleCommitBySlug() {
  const slug = slugInput.value.trim();
  if (!slug) {
    showFeedback('error', 'Enter a question slug or title.');
    return;
  }

  // Normalize: replace spaces with hyphens, lowercase
  const normalizedSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  showFeedback('loading', 'Fetching & committing…');
  setButtons(true);

  try {
    const msg = {
      action: 'commit_by_slug',
      slug: normalizedSlug,
      week: Number(weekSelect.value),
      day: Number(daySelect.value),
    };
    const res = await chrome.runtime.sendMessage(msg);

    if (res.success) {
      showFeedback('success', res.message);
      // Refresh last sync
      const { last_sync } = await chrome.storage.local.get('last_sync');
      if (last_sync) {
        lastSyncBar.style.display = 'flex';
        lastSyncName.textContent = last_sync.question_slug;
        lastSyncTime.textContent = 'just now';
      }
    } else {
      showFeedback('error', res.error || 'Commit failed.');
    }
  } catch (err) {
    showFeedback('error', err.message);
  } finally {
    setButtons(false);
  }
}

async function handleCommitByDate() {
  const date = dateInput.value;
  if (!date) {
    showFeedback('error', 'Pick a date.');
    return;
  }

  showFeedback('loading', 'Fetching submissions…');
  setButtons(true);
  dateResults.style.display = 'none';

  try {
    const msg = {
      action: 'fetch_by_date',
      date,
    };
    const res = await chrome.runtime.sendMessage(msg);

    if (res.success) {
      currentSubmissions = res.submissions;
      if (currentSubmissions.length === 0) {
        showFeedback('info', `No accepted submissions on ${date}.`);
      } else {
        showFeedback('success', `Found ${currentSubmissions.length} submission(s).`);
        renderDateResults();
      }
    } else {
      showFeedback('error', res.error || 'Fetch failed.');
    }
  } catch (err) {
    showFeedback('error', err.message);
  } finally {
    setButtons(false);
  }
}

function renderDateResults() {
  dateResultsList.innerHTML = '';
  currentSubmissions.forEach(sub => {
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'sub-checkbox';
    cb.value = sub.id;
    cb.checked = true;

    // Uncheck select-all if an item gets unchecked
    cb.addEventListener('change', () => {
      const allChecked = Array.from(dateResultsList.querySelectorAll('.sub-checkbox')).every(c => c.checked);
      selectAllCb.checked = allChecked;
    });

    const span = document.createElement('span');
    span.innerHTML = `<span class="submission-item-title">${sub.title}</span> <span class="submission-item-lang">(${sub.lang})</span>`;

    label.appendChild(cb);
    label.appendChild(span);
    dateResultsList.appendChild(label);
  });

  selectAllCb.checked = true;
  dateResults.style.display = 'block';
}

async function handleCommitSelected() {
  const selectedCbs = Array.from(dateResultsList.querySelectorAll('.sub-checkbox:checked'));
  const selectedIds = selectedCbs.map(cb => Number(cb.value));

  if (selectedIds.length === 0) {
    showFeedback('error', 'Select at least one submission.');
    return;
  }

  showFeedback('loading', `Committing ${selectedIds.length} submission(s)…`);
  setButtons(true);
  commitSelectedBtn.disabled = true;

  try {
    const msg = {
      action: 'commit_selected',
      ids: selectedIds,
      week: Number(weekSelect.value),
      day: Number(daySelect.value),
    };
    const res = await chrome.runtime.sendMessage(msg);

    if (res.success) {
      showFeedback('success', res.message);
      dateResults.style.display = 'none';
    } else {
      showFeedback('error', res.error || 'Commit failed.');
    }
  } catch (err) {
    showFeedback('error', err.message);
  } finally {
    setButtons(false);
    commitSelectedBtn.disabled = false;
  }
}

// ── UI helpers ──────────────────────────────────────────────

function showFeedback(type, text) {
  feedback.style.display = 'flex';

  if (type === 'loading') {
    feedback.className = 'feedback feedback-info';
    feedbackIcon.innerHTML = '<span class="spinner"></span>';
  } else if (type === 'success') {
    feedback.className = 'feedback feedback-success';
    feedbackIcon.textContent = '✓';
  } else {
    feedback.className = 'feedback feedback-error';
    feedbackIcon.textContent = '✗';
  }

  feedbackText.textContent = text;
}

function setButtons(disabled) {
  commitSlugBtn.disabled = disabled;
  commitDateBtn.disabled = disabled;
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
