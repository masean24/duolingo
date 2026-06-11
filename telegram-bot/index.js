const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');
let realBrowserConnect = null;
try {
  realBrowserConnect = require('puppeteer-real-browser').connect;
} catch (e) {
  console.warn('puppeteer-real-browser tidak tersedia, akan pakai puppeteer-extra saja:', e.message);
}
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const https = require('https');

puppeteerExtra.use(StealthPlugin());

const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const AUTH_PATH = path.join(DATA_DIR, 'authorized.json');
const ACCOUNTS_PATH = path.join(DATA_DIR, 'accounts.txt');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(p, def) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; }
}
function saveJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

const DEFAULT_CONFIG = {
  redeem_code: 'DUOBNBJUNE2026',
  custom_domains: [],
  email_domain: '',
  password: '',
  capsolver_key: '',
  concurrency: 3,
  delay: 3000,
  headless: true,
};

let config = loadJSON(CONFIG_PATH, { ...DEFAULT_CONFIG });
let authorized = loadJSON(AUTH_PATH, []);

function saveConfig() { saveJSON(CONFIG_PATH, config); }
function saveAuth() { saveJSON(AUTH_PATH, authorized); }

// ===================== BOT SETUP =====================

const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  console.error('ERROR: Set环境 variable BOT_TOKEN (from @BotFather)');
  process.exit(1);
}

const bot = new Telegraf(botToken);

function isAuthorized(ctx, next) {
  const uid = ctx.from.id;
  if (authorized.length > 0 && !authorized.includes(uid)) {
    return ctx.reply('Akses ditolak. Kamu tidak ada di daftar authorized user.');
  }
  return next();
}

bot.use(isAuthorized);

// ===================== COMMANDS =====================

bot.start(async ctx => {
  const uid = ctx.from.id;
  if (!authorized.includes(uid)) {
    authorized.push(uid);
    saveAuth();
  }
  await ctx.reply(
    'Selamat datang di Duolingo Redeem Bot!\n\n'
    + 'Sebelum dipake, setting dulu:\n'
    + '/set_capsolver <API_KEY> — WAJIB\n'
    + '/set_redeem_code <CODE>\n'
    + '/set_domains <dom1,dom2,...> — domain list (ganti wds)\n'
    + '/set_password <PASS>\n\n'
    + 'Terus jalankan:\n'
    + '/redeem <jumlah> — mulai redeem\n\n'
    + 'Commands:\n'
    + '/config — lihat config saat ini\n'
    + '/accounts — lihat akun terakhir\n'
    + '/adduser <ID> — tambah user lain\n'
    + '/users — lihat daftar authorized'
  );
});

bot.command('redeem', async ctx => {
  const args = ctx.message.text.split(' ').slice(1);
  const count = Math.min(Math.max(1, parseInt(args[0]) || 1), 20);

  if (!config.capsolver_key) {
    return ctx.reply('Isi CAPSOLVER_API_KEY dulu pake /set_capsolver');
  }

  await ctx.reply('Mulai redeem ' + count + ' akun...');
  const results = [];

  for (let i = 1; i <= count; i++) {
    let msg;
    try {
      msg = await ctx.reply('[' + i + '/' + count + '] Memproses...');
    } catch (_) { msg = null; }

    // Progress logger — update Telegram message in real-time
    const logFn = async (text) => {
      if (!msg) return;
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
          '[' + i + '/' + count + '] ' + text
        );
      } catch (_) {}
    };

    try {
      const result = await redeemAccount(i, count, config, logFn);
      results.push(result);
      await logFn((result.success ? '✅ SUKSES ' : '❌ GAGAL ') + result.email + ':' + result.password
        + (result.error ? ' — ' + result.error : ''));
    } catch (e) {
      results.push({ success: false, email: '-', password: '-', error: e.message });
      await logFn('❌ GAGAL — ' + e.message);
    }

    // Delay between accounts
    if (i < count) await delay(config.delay || 3000);
  }

  const success = results.filter(r => r.success).length;
  const msg = 'Selesai! ' + success + '/' + count + ' sukses.\n'
    + results.map(r =>
      (r.success ? '✅ ' : '❌ ') + r.email + ':' + r.password
      + (r.error ? ' — ' + r.error : '')
    ).join('\n');
  await ctx.reply(msg);
});

bot.command('config', async ctx => {
  const c = config;
  await ctx.reply(
    'Config saat ini:\n'
    + 'Redeem Code: ' + c.redeem_code + '\n'
    + 'Custom Domains: ' + (c.custom_domains.length ? c.custom_domains.join(', ') : '(kosong)') + '\n'
    + 'Email Domain: ' + (c.email_domain || '(kosong)') + '\n'
    + 'Password: ' + (c.password ? '****' : '(random)') + '\n'
    + 'Capsolver Key: ' + (c.capsolver_key ? c.capsolver_key.substring(0, 8) + '...' : '(kosong)') + '\n'
    + 'Concurrency: ' + c.concurrency + '\n'
    + 'Delay: ' + c.delay + 'ms\n'
    + 'Headless: ' + c.headless
  );
});

bot.command('accounts', async ctx => {
  try {
    const lines = fs.readFileSync(ACCOUNTS_PATH, 'utf8').trim().split('\n').filter(Boolean);
    const last = lines.slice(-20);
    await ctx.reply('Akun terakhir (' + last.length + '):\n' + last.join('\n'));
  } catch {
    await ctx.reply('Belum ada akun tersimpan.');
  }
});

bot.command('adduser', async ctx => {
  const args = ctx.message.text.split(' ').slice(1);
  if (!args[0]) return ctx.reply('Usage: /adduser <telegram_user_id>');
  const id = parseInt(args[0]);
  if (!id || authorized.includes(id)) return ctx.reply('ID sudah ada atau tidak valid.');
  authorized.push(id);
  saveAuth();
  await ctx.reply('User ' + id + ' ditambahkan.');
});

bot.command('users', async ctx => {
  const list = authorized.map((id, i) => (i + 1) + '. ' + id).join('\n') || '(kosong)';
  await ctx.reply('Authorized users:\n' + list);
});

// Setter commands
const setters = {
  redeem_code: (v, c) => { c.redeem_code = v.toUpperCase(); return 'Redeem code diubah'; },
  domains: (v, c) => { c.custom_domains = v.split(',').map(s => s.trim()).filter(Boolean); return 'Custom domains diubah'; },
  email_domain: (v, c) => { c.email_domain = v; return 'Email domain diubah'; },
  password: (v, c) => { c.password = v; return 'Password diubah'; },
  capsolver: (v, c) => { c.capsolver_key = v; return 'Capsolver key diubah'; },
  concurrency: (v, c) => { const n = parseInt(v); if (n < 1 || n > 5) return 'Min 1, max 5'; c.concurrency = n; return 'Concurrency diubah'; },
  delay: (v, c) => { const n = parseInt(v); if (n < 500) return 'Min 500ms'; c.delay = n; return 'Delay diubah'; },
  headless: (v, c) => { c.headless = v === 'true'; return 'Headless diubah'; },
};

for (const [name, handler] of Object.entries(setters)) {
  bot.command('set_' + name, async ctx => {
    const args = ctx.message.text.split(' ').slice(1);
    const val = args.join(' ');
    if (!val) return ctx.reply('Masukkan nilai');
    const result = handler(val, config);
    saveConfig();
    await ctx.reply(result);
  });
}

// ===================== CORE REDEEM LOGIC =====================

const delay = ms => new Promise(r => setTimeout(r, ms));
const randDelay = (a, b) => delay(Math.floor(Math.random() * (b - a) + a));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const FIRST = ['James','Emma','Liam','Olivia','Noah','Ava','William','Sophia','Benjamin','Isabella','Lucas','Mia'];
const LAST = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Martinez'];
const fakeName = () => pick(FIRST) + ' ' + pick(LAST);

function generatePassword(cfg) {
  if (cfg.password) return cfg.password;
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  return 'A1!' + Array.from({ length: 9 }, () => pool[Math.floor(Math.random() * pool.length)]).join('')
    .split('').sort(() => Math.random() - 0.5).join('');
}

function generateEmail(cfg) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let domain;
  if (cfg.custom_domains && cfg.custom_domains.length > 0) {
    domain = cfg.custom_domains[Math.floor(Math.random() * cfg.custom_domains.length)];
  } else if (cfg.email_domain) {
    domain = cfg.email_domain;
  } else {
    throw new Error('Isi CUSTOM_DOMAINS atau EMAIL_DOMAIN dulu');
  }
  let local = '';
  for (let i = 0; i < 13; i++) local += chars[Math.floor(Math.random() * chars.length)];
  return local + '@' + domain;
}

function capsolverPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.capsolver.com',
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function solveRecaptcha(siteKey, pageUrl, action, apiKey) {
  if (!apiKey) return null;
  const createRes = await capsolverPost('/createTask', {
    clientKey: apiKey,
    task: {
      type: 'ReCaptchaV3EnterpriseTaskProxyless',
      websiteURL: pageUrl,
      websiteKey: siteKey,
      pageAction: action || 'signup',
    },
  });
  if (createRes.errorId !== 0) return null;
  for (let i = 0; i < 40; i++) {
    await delay(3000);
    const res = await capsolverPost('/getTaskResult', { clientKey: apiKey, taskId: createRes.taskId });
    if (res.status === 'ready') return res.solution.gRecaptchaResponse;
    if (res.errorId !== 0) return null;
  }
  return null;
}

async function typeInto(page, selectors, value, timeout) {
  const deadline = Date.now() + (timeout || 5000);
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      try {
        const el = await page.waitForSelector(sel, { timeout: 2000, visible: true });
        if (el) {
          await page.click(sel);
          await randDelay(150, 350);
          await page.$eval(sel, el => { el.value = ''; });
          await page.type(sel, value, { delay: 60 + Math.floor(Math.random() * 50) });
          return true;
        }
      } catch (_) {}
    }
    await delay(500);
  }
  return false;
}

async function clickNative(page, keywords, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 10000);
  while (Date.now() < deadline) {
    const handle = await page.evaluateHandle(kws => {
      const els = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      for (const el of els) {
        const txt = (el.textContent || '').trim().toUpperCase();
        if (kws.some(k => txt === k.toUpperCase() || txt.includes(k.toUpperCase()))) return el;
      }
      return null;
    }, keywords);
    const el = handle.asElement();
    if (el) {
      try {
        await el.scrollIntoView();
        await delay(300);
        await el.click({ delay: 80 });
        return await el.evaluate(n => n.textContent.trim());
      } catch (_) {}
    }
    await delay(200);
  }
  return null;
}

async function redeemAccount(cycle, total, cfg, log) {
  if (!log) log = async () => {};
  const email = generateEmail(cfg);
  const password = generatePassword(cfg);
  const name = fakeName();
  const age = String(Math.floor(Math.random() * 10) + 20);

  let browser = null, page = null, usingRealBrowser = false, capturedSiteKey = null;

  try {
    // ===== LAUNCH BROWSER =====
    if (cfg.headless) {
      await log('🌐 Launching headless browser...');
      browser = await puppeteerExtra.launch({
        headless: 'new',
        args: [
          '--no-sandbox', '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', '--disable-gpu',
          '--window-size=1280,900',
        ],
      });
      const pages = await browser.pages();
      page = pages[0] || await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
    } else {
      // Try puppeteer-real-browser first, fallback to puppeteer-extra
      if (realBrowserConnect) {
        try {
          await log('🌐 Launching real browser...');
          const rb = await realBrowserConnect({
            headless: false, args: [], customConfig: {}, skipTarget: [],
            fingerprint: true, turnstile: true,
            connectOption: { defaultViewport: { width: 1280, height: 900 } },
            disableXvfb: false, ignoreAllFlags: false,
          });
          browser = rb.browser;
          page = rb.page;
          usingRealBrowser = true;
          await page.setViewport({ width: 1280, height: 900 });
        } catch (rbErr) {
          await log('⚠️ Real browser gagal: ' + rbErr.message + '\nFallback ke puppeteer-extra...');
          console.error('puppeteer-real-browser failed:', rbErr.message);
        }
      } else {
        await log('ℹ️ puppeteer-real-browser tidak tersedia, pakai puppeteer-extra...');
      }

      // Fallback if real browser failed or unavailable
      if (!browser) {
        browser = await puppeteerExtra.launch({
          headless: 'new',
          args: [
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', '--disable-gpu',
            '--window-size=1280,900',
          ],
        });
        const pages = await browser.pages();
        page = pages[0] || await browser.newPage();
        usingRealBrowser = false;
        await page.setViewport({ width: 1280, height: 900 });
      }
    }

    // ===== INTERCEPT reCAPTCHA SITEKEY =====
    page.on('request', req => {
      const url = req.url();
      const m = url.match(/render=([^&"]+)/);
      if (m && m[1] !== 'explicit' && !capturedSiteKey) capturedSiteKey = m[1];
    });

    // ===== NAVIGATE TO REDEEM PAGE =====
    await log('📄 Membuka halaman redeem...');
    const redeemUrl = 'https://www.duolingo.com/redeem?code=' + cfg.redeem_code;
    await page.goto(redeemUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000);

    // ===== CLICK CLAIM OFFER =====
    await log('🔍 Mencari tombol Claim Offer...');
    const claimClicked = await clickNative(page, ['CLAIM OFFER', 'CLAIM', 'ACTIVATE', 'REDEEM'], 12000);
    if (!claimClicked) {
      const bt = await page.evaluate(() => document.body.innerText.substring(0, 300)).catch(() => '');
      throw new Error('CLAIM OFFER tidak ditemukan: ' + bt);
    }
    await log('✅ Claim Offer diklik');
    await randDelay(800, 1500);

    // ===== FILL AGE =====
    await log('📝 Mengisi form Age...');
    const ageOk = await typeInto(page, [
      '[data-test="age-input"]', 'input[placeholder="Age"]',
      'input[placeholder*="age" i]', 'input[name="age"]', 'input[type="number"]',
    ], age, 8000);
    if (!ageOk) throw new Error('Field Age tidak ditemukan');
    await randDelay(600, 900);
    await clickNative(page, ['NEXT'], 5000);
    await randDelay(2000, 3000);

    // ===== FILL NAME =====
    await log('📝 Mengisi Name: ' + name);
    await typeInto(page, [
      '[data-test="name-input"]', 'input[name="name"]', 'input[placeholder*="name" i]',
    ], name, 4000);
    await randDelay(300, 500);

    // ===== FILL EMAIL =====
    await log('📝 Mengisi Email: ' + email);
    const emailOk = await typeInto(page, [
      '[data-test="email-input"]', 'input[type="email"]', 'input[name="email"]', 'input[placeholder*="email" i]',
    ], email, 6000);
    if (!emailOk) throw new Error('Field email tidak ditemukan');
    await randDelay(300, 500);

    // ===== FILL PASSWORD =====
    await log('📝 Mengisi Password...');
    const passOk = await typeInto(page, [
      '[data-test="password-input"]', 'input[type="password"]', 'input[name="password"]', 'input[placeholder*="password" i]',
    ], password, 6000);
    if (!passOk) throw new Error('Field password tidak ditemukan');
    await randDelay(500, 800);

    // ===== SOLVE reCAPTCHA =====
    if (capturedSiteKey && cfg.capsolver_key) {
      await log('🤖 Solving reCAPTCHA (siteKey: ' + capturedSiteKey.substring(0, 10) + '...)...');
      const token = await solveRecaptcha(capturedSiteKey, page.url(), 'signup', cfg.capsolver_key);
      if (token) {
        await page.evaluate((t) => {
          // Inject token into reCAPTCHA callback
          if (typeof ___grecaptcha_cfg !== 'undefined') {
            const clients = ___grecaptcha_cfg.clients;
            for (const cid in clients) {
              const client = clients[cid];
              for (const key in client) {
                const widget = client[key];
                if (widget && typeof widget === 'object') {
                  for (const k2 in widget) {
                    if (widget[k2] && widget[k2].sitekey) {
                      widget[k2].response = t;
                    }
                  }
                }
              }
            }
          }
          // Also set in textarea
          const ta = document.querySelector('#g-recaptcha-response') || document.querySelector('[name="g-recaptcha-response"]');
          if (ta) { ta.value = t; ta.style.display = 'none'; }
          // Also try callback
          if (window.onRecaptchaSuccess) window.onRecaptchaSuccess(t);
        }, token);
        await log('✅ reCAPTCHA solved');
      } else {
        await log('⚠️ reCAPTCHA gagal, coba lanjut tanpa token...');
      }
    } else if (!capturedSiteKey) {
      await log('ℹ️ Tidak ada reCAPTCHA terdeteksi, skip solve');
    }

    // ===== CLICK CREATE ACCOUNT =====
    await log('🚀 Klik Create Account...');
    const signedUp = await clickNative(page, ['CREATE ACCOUNT', 'SIGN UP', 'CREATE PROFILE', 'REGISTER'], 6000);
    if (!signedUp) await page.keyboard.press('Enter');
    await delay(5000);

    // ===== CHECK RESULT =====
    await log('🔎 Mengecek hasil...');
    let superActivated = false;
    const pageUrl = page.url();
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase()).catch(() => '');

    if (
      pageUrl.includes('/learn') || pageUrl.includes('/home') || pageUrl.includes('/dashboard') ||
      pageText.includes('already on super') || pageText.includes("you've activated") ||
      pageText.includes("you're already") || pageText.includes('super is now active') ||
      pageText.includes('congratulations') || pageText.includes('activated')
    ) {
      superActivated = true;
    }

    if (!superActivated) {
      // Wait a bit more and re-check
      await delay(3000);
      const pageUrl2 = page.url();
      const pageText2 = await page.evaluate(() => document.body.innerText.toLowerCase()).catch(() => '');
      if (
        pageUrl2.includes('/learn') || pageUrl2.includes('/home') || pageUrl2.includes('/dashboard') ||
        pageText2.includes('super') || pageText2.includes('congratulations') || pageText2.includes('activated')
      ) {
        superActivated = true;
      }
    }

    if (!superActivated) {
      const stillOnForm = await page.evaluate(() => {
        const email = document.querySelector('input[type="email"]');
        const pass = document.querySelector('input[type="password"]');
        return !!(email || pass);
      }).catch(() => false);
      if (!stillOnForm && !page.url().includes('isLoggingIn')) superActivated = true;
    }

    const line = email + ':' + password;
    fs.appendFileSync(ACCOUNTS_PATH, line + '\n', 'utf8');

    return { success: superActivated, email, password, error: null };
  } catch (err) {
    const line = email + ':' + password + ' (FAILED: ' + err.message + ')';
    fs.appendFileSync(ACCOUNTS_PATH, line + '\n', 'utf8');
    return { success: false, email, password, error: err.message };
  } finally {
    try { if (page) await page.close(); } catch (_) {}
    // Always close browser — fix zombie process leak
    if (browser) { try { await browser.close(); } catch (_) {} }
  }
}

// ===================== START =====================

bot.launch().then(() => console.log('Bot running...'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
