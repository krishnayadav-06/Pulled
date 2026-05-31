/**
 * options.js — Options page logic
 *
 * Reads/writes config in chrome.storage.sync.
 * Handles mode slider, preset quick-picks, live path preview, and connection test.
 * Depends on previewTemplate() from path-builder.js (loaded via script tag).
 */

// ── DOM refs ────────────────────────────────────────────────

const tokenInput        = document.getElementById('github-token');
const ownerInput        = document.getElementById('github-owner');
const repoInput         = document.getElementById('github-repo');
const branchInput       = document.getElementById('github-branch');
const testBtn           = document.getElementById('test-connection-btn');
const testResult        = document.getElementById('test-result');
const modeTemplate      = document.getElementById('mode-template');
const modeCollege       = document.getElementById('mode-college');
const modeTrack         = document.getElementById('mode-track');
const panelTemplate     = document.getElementById('panel-template');
const panelCollege      = document.getElementById('panel-college');
const pathTemplateInput = document.getElementById('path-template');
const pathPreview       = document.getElementById('path-preview');
const skipExisting      = document.getElementById('skip-existing');
const commitTemplate    = document.getElementById('commit-template');
const saveBtn           = document.getElementById('save-btn');
const saveStatus        = document.getElementById('save-status');
const clearTokenBtn     = document.getElementById('clear-token-btn');
const resetAllBtn       = document.getElementById('reset-all-btn');

let activeMode = 'template';

// ── Defaults ────────────────────────────────────────────────

const DEFAULTS = {
  github_token: '',
  github_owner: '',
  github_repo: '',
  github_branch: 'main',
  folder_mode: 'template',
  path_template: 'leetcode/{difficulty}/{id}_{slug}/solution.{ext}',
  commit_message_template: 'Add {id}. {title} [{language}] - {date}',
  skip_existing: true,
};

// ── Init ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const config = await chrome.storage.sync.get(DEFAULTS);

  // Populate fields
  tokenInput.value        = config.github_token;
  ownerInput.value        = config.github_owner;
  repoInput.value         = config.github_repo;
  branchInput.value       = config.github_branch;
  pathTemplateInput.value = config.path_template;
  commitTemplate.value    = config.commit_message_template;
  skipExisting.checked    = config.skip_existing;

  // Set mode
  activeMode = config.folder_mode;
  updateModeUI();
  updatePreview();

  // ── Event listeners ─────────────────────────────────────

  // Mode slider
  modeTemplate.addEventListener('click', () => switchMode('template'));
  modeCollege.addEventListener('click', () => switchMode('college'));

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      pathTemplateInput.value = btn.dataset.template;
      updatePreview();
    });
  });

  // Live preview
  pathTemplateInput.addEventListener('input', updatePreview);

  // Save
  saveBtn.addEventListener('click', handleSave);

  // Test connection
  testBtn.addEventListener('click', handleTestConnection);

  // Danger zone
  clearTokenBtn.addEventListener('click', handleClearToken);
  resetAllBtn.addEventListener('click', handleResetAll);
}

// ── Mode slider ─────────────────────────────────────────────

function switchMode(mode) {
  activeMode = mode;
  updateModeUI();
}

function updateModeUI() {
  if (activeMode === 'template') {
    modeTemplate.classList.add('mode-active');
    modeCollege.classList.remove('mode-active');
    modeTrack.classList.remove('right');
    panelTemplate.style.display = 'block';
    panelCollege.style.display = 'none';
  } else {
    modeCollege.classList.add('mode-active');
    modeTemplate.classList.remove('mode-active');
    modeTrack.classList.add('right');
    panelTemplate.style.display = 'none';
    panelCollege.style.display = 'block';
  }
}

// ── Live preview ────────────────────────────────────────────

function updatePreview() {
  const template = pathTemplateInput.value.trim();
  if (!template) {
    pathPreview.textContent = '(empty template)';
    return;
  }
  pathPreview.textContent = previewTemplate(template);
}

// ── Save ────────────────────────────────────────────────────

async function handleSave() {
  const config = {
    github_token: tokenInput.value.trim(),
    github_owner: ownerInput.value.trim(),
    github_repo: repoInput.value.trim(),
    github_branch: branchInput.value.trim() || 'main',
    folder_mode: activeMode,
    path_template: pathTemplateInput.value.trim() || DEFAULTS.path_template,
    commit_message_template: commitTemplate.value.trim() || DEFAULTS.commit_message_template,
    skip_existing: skipExisting.checked,
  };

  await chrome.storage.sync.set(config);

  saveStatus.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px; vertical-align:-2px"><polyline points="20 6 9 17 4 12"></polyline></svg>Saved';
  saveStatus.style.color = '#15803d';
  setTimeout(() => { saveStatus.innerHTML = ''; }, 2500);
}

// ── Test connection ─────────────────────────────────────────

async function handleTestConnection() {
  testResult.textContent = 'Testing…';
  testResult.className = 'test-result';
  testBtn.disabled = true;

  try {
    const res = await chrome.runtime.sendMessage({ 
      action: 'test_connection',
      token: tokenInput.value.trim(),
      owner: ownerInput.value.trim(),
      repo: repoInput.value.trim()
    });
    if (res.ok) {
      testResult.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px; vertical-align:-2px"><polyline points="20 6 9 17 4 12"></polyline></svg>Connected';
      testResult.className = 'test-result test-result-ok';
    } else {
      testResult.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px; vertical-align:-2px"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' + (res.error || 'Failed');
      testResult.className = 'test-result test-result-fail';
    }
  } catch (err) {
    testResult.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px; vertical-align:-2px"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' + err.message;
    testResult.className = 'test-result test-result-fail';
  } finally {
    testBtn.disabled = false;
  }
}

// ── Danger zone ─────────────────────────────────────────────

async function handleClearToken() {
  if (!confirm('Clear the stored GitHub token?')) return;
  await chrome.storage.sync.remove('github_token');
  tokenInput.value = '';
  saveStatus.textContent = 'Token cleared';
  saveStatus.style.color = '#dc2626';
  setTimeout(() => { saveStatus.textContent = ''; }, 2500);
}

async function handleResetAll() {
  if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;
  await chrome.storage.sync.set(DEFAULTS);
  await chrome.storage.local.clear();

  // Re-populate fields
  tokenInput.value        = DEFAULTS.github_token;
  ownerInput.value        = DEFAULTS.github_owner;
  repoInput.value         = DEFAULTS.github_repo;
  branchInput.value       = DEFAULTS.github_branch;
  pathTemplateInput.value = DEFAULTS.path_template;
  commitTemplate.value    = DEFAULTS.commit_message_template;
  skipExisting.checked    = DEFAULTS.skip_existing;
  activeMode              = DEFAULTS.folder_mode;

  updateModeUI();
  updatePreview();

  saveStatus.textContent = 'Reset to defaults';
  saveStatus.style.color = '#dc2626';
  setTimeout(() => { saveStatus.textContent = ''; }, 2500);
}
