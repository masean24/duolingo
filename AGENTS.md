# AGENTS.md — BOT DUOLINGGO REDEEM

## What this is

Automation bot that creates Duolingo accounts and redeems Super promo codes using Puppeteer + CapSolver for reCAPTCHA.

## Commands

```bash
npm install         # install dependencies (Node.js 18+ required, Chrome must be installed)
npm start           # run bot (node index.js)
```

No tests, linter, typechecker, or CI exist. Do not run them.

## Architecture

| File | Role |
|---|---|
| `index.js` | Entry point & core logic |
| `config.js` | Config loader from env (was obfuscated, now readable) |
| `settings.js` | Env reader (was obfuscated, now readable) |
| `wdsmail-otp.js` | Temp email generator (was obfuscated, now readable) |
| `.env` | All configuration lives here |
| `accounts.txt` | Output: created accounts with status |

## Key behaviors (from `index.js`)

- Browser engine: `puppeteer-real-browser` (`connect()`) → fallback `puppeteer-extra` (`launch()`). When `HEADLESS=true`, skips real-browser and goes straight to puppeteer-extra headless.
- Concurrency pool spawns browsers with a **3-second stagger** between launches (max 5)
- Window minimize happens **after** page load (not at launch — breaks rendering otherwise)
- CapSolver task type: `ReCaptchaV3EnterpriseTaskProxyless`
- Click/type helpers use multiple fallback selectors for Duolingo's UI variants
- `page.goto` uses `domcontentloaded` (not `networkidle2`) for speed

## Config (`.env`)

| Variable | Required | Notes |
|---|---|---|
| `CAPSOLVER_API_KEY` | ✅ | CapSolver API key |
| `REDEEM_CODE` | ❌ | Default: `DUOBNBJUNE2026` |
| `EMAIL_DOMAIN` | ❌ | Single custom domain; empty = auto pool |
| `CUSTOM_DOMAINS` | ❌ | Comma-separated list, overrides WDS pool |
| `PASSWORD` | ❌ | Empty = random per account |
| `DEFAULT_CONCURRENCY` | ❌ | Max 5, default 3 |
| `HEADLESS` | ❌ | `true` = puppeteer-extra headless (skip real-browser) |
| `MINIMIZE_WINDOW` | ❌ | `true`/`false` |
| `DELAY_BETWEEN_ACCOUNTS` | ❌ | ms, default 3000 |

## Gotchas

- The bot prompts interactively for email domain, account count, and parallelism.
- `accounts.txt` path is configurable via `ACCOUNTS_FILE` in `.env`.
- `puppeteer-real-browser` does not work in headless mode; `HEADLESS` in config defaults to `false`.
- To use your own domain list, set `CUSTOM_DOMAINS=dom1.com,dom2.com` in `.env` (overrides built-in WDS pool).

## Telegram Bot (`telegram-bot/`)

Standalone bot in `telegram-bot/`. Run with `BOT_TOKEN` env var from @BotFather:

```bash
cd telegram-bot
set BOT_TOKEN=xxx:yyy && npm start
```

First user who runs `/start` becomes authorized. Add others via `/adduser <id>`. All config is settable via Telegram commands (`/set_capsolver`, `/set_redeem_code`, `/set_domains`, etc.). Whitelist-based access — only authorized IDs can use commands.
