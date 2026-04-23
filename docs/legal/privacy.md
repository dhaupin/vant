---
permalink: /legal/privacy.html
layout: default
title: Privacy Policy
---

# Privacy Policy

> What Vant collects, uses, and protects. Updated: April 2025.

---

## WHAT WE COLLECT

### Information You Provide

**You control what you share:**

- Brain files in `models/public/` - You decide what goes here
- Configuration in `.env` - Your tokens, your settings
- Custom modifications - Your code, your prompts

**Vant does NOT require:**
- Personal information
- Registration
- Account

### Information Vant Uses

**GitHub API (when you configure):**

When you set up GitHub sync, Vant may access:
- Repository content (read/write)
- Commit history
- Branch information

**This is YOUR GitHub account - we don't collect anything.**

### Automatically Collected

- Node.js environment variables (tokens, config)
- Local file system access (your brain)
- Session data (runtime only)

**We don't track you. We don't have analytics. We don't log personal data.**

---

## HOW WE USE INFORMATION

### Primary Use

Vant processes:
- Your brain files (locally)
- Your GitHub data (via your token)
- Configuration (in memory only)

**What's processed stays on your machine.**

### GitHub Access

If you configure GitHub sync:
- Vant reads your repository (to sync)
- Vant writes to your repository (to save changes)
- Vant checks for updates (periodic poll)

**This is done via YOUR GitHub token on YOUR account.**

### No Selling or Sharing

**We do NOT:**
- Sell your data
- Share your data
- Use your data for advertising
- Profile you
- Target you

---

## DATA STORAGE

### Local Only

Your brain is stored:
- On your machine
- In your git repository
- Wherever you clone/checkout

**We don't have your data - you do.**

### GitHub

When using GitHub sync:
- Your brain goes to YOUR GitHub account
- Your repository is YOUR data
- GitHub's servers are YOUR storage

**We don't control your GitHub data - GitHub does.**

### Environment Variables

Tokens/config in `.env`:
- Stored locally by YOU
- Never committed to git (add `.env` to `.gitignore`)
- Loaded into memory at runtime

---

## SECURITY
Keep your brain and tokens safe.

### Local Security

**You are responsible for:**
- `.env` file security
- Token security
- Machine security

**Best practices:**
- Never commit tokens
- Use `.env` files (gitignored)
- Rotate tokens regularly
- Use minimal scopes

### Security Incidents

**If your token is exposed:**
1. Revoke the token immediately
2. Generate a new token
3. Update your `.env`
4. Check your GitHub audit log

**Vant cannot prevent token exposure - only you can.**

### Vulnerabilities

We try to keep Vant secure:
- Regular updates
- Security best practices
- VAF input validation
- Code reviews

**Report vulnerabilities:**
- Open an issue
- Don't exploit

---

## THIRD PARTIES

### GitHub

Your data may be stored on GitHub servers:
- Subject to GitHub's Privacy Policy
- Subject to GitHub's Terms of Service
- GitHub may access your data

**GitHub's policies apply - not ours.**

### NPM Packages

Vant uses open source packages:
- Check `package.json` for dependencies
- Each package has its own license
- Check package documentation

**We don't control third-party packages.**

---

## CHILDREN

Vant is not intended for children under 13.

**If you are under 13:**
- Don't use Vant
- Don't provide any information

---

## CHANGES

We may change this policy.

**Changes take effect:**
- When posted
- Your continued use = acceptance

---

## YOUR RIGHTS

### To Your Data

You have full control:
- Edit your brain anytime
- Delete your brain anytime
- Choose what to sync
- Revoke tokens anytime

### To Request Deletion

Since we don't have your data:
- Your data is YOURS
- GitHub has THEIR data
- We can't delete GitHub data

### To Export

Export your brain:
```bash
# Clone your repository
git clone https://github.com/yourname/vant.git

# Or use GitHub's export
```

Example:

---

## CONTACT

Questions about privacy:
- Open an issue on GitHub
- Check documentation

---

## KEY POINTS

| Point | What It Means |
|-------|-------------|
| No sign-up | No account needed |
| No tracking | No analytics |
| Local data | Works offline |
| Your GitHub | Your token, your data |
| No selling | We don't monetize your data |
| You control | Your brain, your choice |

---

## LEGAL BASIS

Processing is necessary for:
- Providing the service (you use Vant)
- Legitimate interests (improving Vant)

We process:
- With your consent (configuring GitHub)
- For contract performance (using Vant)
- Legally where required

---

## COMPLAINTS

If you have concerns:
1. Open an issue on GitHub
2. We will respond
3. Escalate if needed

---

## SEE ALSO

- [GitHub Privacy](https://docs.github.com/en/github/site-policy/github-privacy-statement) - GitHub's policy
- [Terms](/vant/index.html) - Our legal terms
- [Security](/vant/guides/security.html) - Security practices