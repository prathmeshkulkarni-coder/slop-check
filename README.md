# 🤖 slop-check

> A CLI tool to detect low-effort, AI-generated contributions in open-source GitHub Pull Requests using Google Gemini.

## ⚠️ Security Notice

> **This tool sends PR diffs to the Google Gemini API for analysis.**
> - ✅ Safe for **public, open-source repositories**
> - ❌ **Do NOT use on private or proprietary repositories** — code will leave your infrastructure and be processed by Google's servers
> - Your `GEMINI_API_KEY` is always stored locally in `.env` or in GitHub Secrets — it is never bundled into the published package
> - Without a `GITHUB_TOKEN`, the GitHub API is rate-limited to **60 requests/hour per IP**. Add a token to avoid this

## Features

- **Semantic Code Review**: Uses Google Gemini to actually _read_ and _understand_ the PR diff — not just count lines.
- **Strict Analysis**: Acts as a meticulous senior engineer, flagging bugs, code smells, AI hallucinations, and architectural issues.
- **Auto-Comment**: Posts the full review directly as a GitHub PR comment via `--post-comment`.
- **CI/CD Native**: Designed to run inside GitHub Actions automatically on every new PR.

## Installation

**Via NPM (recommended):**
```bash
npm install -g @prathmesh2402/slop-check
```

**Or run directly without installing:**
```bash
npx @prathmesh2402/slop-check pr <github-pr-url>
```

**For contributors (clone & build from source):**
```bash
git clone https://github.com/prathmesh2402/slop-check.git
cd slop-check
npm install
npm run build
```

## Usage

### Local Analysis
```bash
export GEMINI_API_KEY="your-gemini-api-key"
node dist/index.js pr https://github.com/owner/repo/pull/123
```

### Auto-Post Comment on GitHub PR
```bash
export GEMINI_API_KEY="your-gemini-api-key"
export GITHUB_TOKEN="your-github-token"
node dist/index.js pr https://github.com/owner/repo/pull/123 --post-comment
```

## GitHub Action Setup

To run `slop-check` automatically on every PR in your repository:

1. Add `GEMINI_API_KEY` to your repository's **Settings → Secrets and variables → Actions**.
2. Create the file `.github/workflows/slop-check.yml` in your repository with the following content:

```yaml
name: Slop-Check AI Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  slop-check:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install slop-check
        run: |
          git clone https://github.com/YOUR_USERNAME/slop-check.git
          cd slop-check
          npm install
          npm run build

      - name: Run Slop-Check
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          node slop-check/dist/index.js pr ${{ github.event.pull_request.html_url }} --post-comment
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ Always | Get a free key from [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `GITHUB_TOKEN` | Only with `--post-comment` | GitHub Personal Access Token or `secrets.GITHUB_TOKEN` in Actions |
