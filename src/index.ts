#!/usr/bin/env node
import 'dotenv/config';

import { Command } from 'commander';
import chalk from 'chalk';
import { Octokit } from '@octokit/rest';
import { GoogleGenAI } from '@google/genai';

const program = new Command();
const octokit = new Octokit(process.env.GITHUB_TOKEN ? { auth: process.env.GITHUB_TOKEN } : undefined);

program
  .name('slop-check')
  .description('A CLI to detect low-effort, AI-generated contributions in open-source repos.')
  .version('1.0.0');

program
  .command('pr <url>')
  .description('Analyze a GitHub Pull Request for potential "slop"')
  .option('--post-comment', 'Automatically post the AI review as a comment on the PR')
  .action(async (url, options) => {
    if (!process.env.GEMINI_API_KEY) {
      console.error(chalk.red('Error: GEMINI_API_KEY environment variable is missing.'));
      console.error(chalk.yellow('Please set it using: export GEMINI_API_KEY="your-api-key"'));
      process.exit(1);
    }
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    console.log(chalk.blue(`Analyzing PR: ${url}...`));

    // Parse the URL to get owner, repo, and PR number
    // Expected format: https://github.com/owner/repo/pull/number
    const regex = /github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/;
    const match = url.match(regex);

    if (!match) {
      console.error(chalk.red('Invalid GitHub PR URL. Format expected: https://github.com/owner/repo/pull/123'));
      process.exit(1);
    }

    const [, owner, repo, prNumberStr] = match;
    const pull_number = parseInt(prNumberStr, 10);

    try {
      // Fetch PR Details
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number,
      });

      console.log(chalk.green(`Successfully fetched PR: ${pr.title}`));

      // Fetch PR Diff
      const diffResponse = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number,
        mediaType: {
          format: 'diff'
        }
      });
      const diff = diffResponse.data as unknown as string;

      // LLM Semantic Review
      console.log(chalk.cyan('\nRunning semantic AI slop analysis using Gemini...'));

      const prompt = `
You are a highly strict and meticulous open-source maintainer evaluating a Pull Request. Your job is to aggressively identify any "AI slop" (low-effort, AI-generated code, hallucinated APIs, useless boilerplate) AND any potential bugs, code smells, or logical issues in the code.

PR Title: ${pr.title}
PR Description: ${pr.body || 'No description provided.'}

Here is the diff:
\`\`\`diff
${diff.substring(0, 50000)}
\`\`\`

Analyze the code changes thoroughly. Do NOT be lenient.
1. If the PR is absolutely flawless, contains zero code smells, and has no signs of AI slop, respond with EXACTLY the word "PASS" and nothing else.
2. If you find ANY issues (even minor code smells, potential bugs, poor architectural choices, or signs of AI slop), respond with "REVIEW_REQUIRED", followed by a detailed bulleted list. For each issue, specify:
   - The file and line number.
   - The exact nature of the problem (e.g., "Hallucinated API", "Uncaught Promise", "Lazy eslint-disable", "Inefficient loop", "Missing test").
   - Why it is problematic and how it should be fixed.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const analysis = response.text;

      console.log(chalk.blue('\n--- Slop-Check Report ---'));
      if (analysis?.trim() === 'PASS') {
        console.log(chalk.green('✅ Pass: The code is flawless. No obvious AI slop or issues detected.'));
      } else {
        console.log(chalk.red('❌ Issues Detected: Please review the code manually based on the following feedback:'));
        console.log(chalk.yellow(`\n${analysis}`));
      }

      if (options.postComment) {
        if (!process.env.GITHUB_TOKEN) {
          console.error(chalk.red('\n[Error] Cannot post comment. GITHUB_TOKEN environment variable is missing.'));
          process.exit(1);
        }
        
        console.log(chalk.blue('\nPosting review to GitHub PR...'));
        let commentBody = `### 🤖 Slop-Check Review\n\n`;
        if (analysis?.trim() === 'PASS') {
          commentBody += `✅ **Pass:** The code is flawless. No obvious AI slop or issues detected.`;
        } else {
          commentBody += `❌ **Issues Detected:** Please review the code based on the following feedback:\n\n${analysis}`;
        }
        
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pull_number,
          body: commentBody
        });
        
        console.log(chalk.green('Successfully posted review to GitHub!'));
      }

    } catch (error: any) {
      if (error.message && error.message.includes('too_large')) {
        console.log(chalk.yellow("\n[Alert] The diff exceeded GitHub's maximum line limit (20,000 lines)."));
        console.log(chalk.blue('\n--- Slop-Check Report ---'));
        console.log(chalk.red('❌ Fail: Potential AI slop detected. Please review manually.'));
        console.log(chalk.red('- Massive Code Churn: The PR is so large that GitHub refused to serve the diff.'));
        process.exit(1);
      } else {
        console.error(chalk.red(`Failed to fetch PR data: ${error.message}`));
        process.exit(1);
      }
    }
  });

program.parse();
