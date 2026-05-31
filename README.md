# LeetCode → GitHub Sync — Chrome Extension

A Chrome extension that lets you push LeetCode solutions directly to a GitHub repository on demand. Solutions are committed exactly as they were accepted by LeetCode's judge, with zero reformatting. 

You can sync individual questions or fetch solutions by date.

## Features

- **On-Demand Syncing:** No background scraping. You control when and what to sync via the extension popup.
- **Date Sync:** Fetch all accepted submissions for a specific date.
- **Two Folder Structure Modes:**
  - **Token Template Mode:** Create your own custom folder structure (e.g., `leetcode/{year}/{difficulty}/{slug}/solution.{ext}`) with a live preview.
  - **College Workflow Mode:** A fixed hierarchy designed for lab schedules (e.g., `Week_1/Day_2/0001_two-sum.py`), selectable directly from the popup.
- **Zero Backend:** All logic runs locally inside the Chrome extension. No third-party servers see your data.

## Installation (Developer Mode)

Since this extension is in development, you can load it directly into Chrome:

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top right corner).
4. Click **Load unpacked** in the top left corner.
5. Select the folder containing the extension's files (where `manifest.json` is located).

## Configuration & Usage

### 1. Set Up Your GitHub Token
To allow the extension to push code to your repository, you need a GitHub Personal Access Token.
1. Go to your [GitHub Developer Settings](https://github.com/settings/tokens).
2. Generate a new token (Classic or Fine-grained) with `contents: write` permissions for the repository you want to use.
3. Open the extension's **Options Page** (right-click the extension icon -> Options).
4. Enter your GitHub Token, Username (Owner), Repository Name, and Branch (e.g., `main`).
5. Click **Test connection** to ensure everything is working.

### 2. Choose Your Folder Structure
In the Options page, select how you want your files organized:
- **Token Template:** Define a custom path using variables like `{year}`, `{difficulty}`, `{slug}`, and `{language}`.
- **College Workflow:** Uses a fixed `Week_N / Day_N` structure. When this mode is active, you will select the Week and Day directly in the extension popup before committing.

### 3. Sync Your Solutions
Click the extension icon in your toolbar to open the popup:
- **By Question:** Type the question name or slug and click Commit.
- **By Date:** Pick a date to sync all accepted submissions from that day.

## File Format

Files are saved exactly as submitted, prefixed with a metadata comment block. For example:

```python
# ============================================================
# 1. Two Sum
# Difficulty : Easy
# Language   : Python 3
# Runtime    : 52 ms (beats 87.4%)
# Memory     : 17.3 MB (beats 62.1%)
# Submitted  : 2024-03-01 14:22:08 UTC
# URL        : https://leetcode.com/problems/two-sum/
# ============================================================

class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        # your code here...
```

## Privacy & Security

- **No backend servers.** The extension communicates directly with the LeetCode GraphQL API and the GitHub REST API.
- **Local credentials.** Your GitHub token is stored securely in your browser's encrypted sync storage (`chrome.storage.sync`).
