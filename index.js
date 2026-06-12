/**
 * BOT DUOLINGO REDEEM - FULL AUTO
 * Kode Promo: UBERMDAYSABUP6M
 * Author: @Drosek
 */

const { connect }    = require('puppeteer-real-browser');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin  = require('puppeteer-extra-plugin-stealth');
const fs             = require('fs');
const https          = require('https');
const readline       = require('readline');
const config         = require('./config');
const settings       = require('./settings');
const { generateEmail } = require('./wdsmail-otp');

puppeteerExtra.use(StealthPlugin());

// ===================== CAPSOLVER =====================

function capsolverPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: 'api.capsolver.com',
      path,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function solveRecaptcha(websiteURL, websiteKey, action) {
  const apiKey = settings.CAPSOLVER_API_KEY;
  if (!apiKey) return null;

  console.log('  [CAP] Solving reCAPTCHA Enterprise...');
  const createRes = await capsolverPost('/createTask', {
    clientKey: apiKey,
    task: {
      type:        'ReCaptchaV3EnterpriseTaskProxyless',
      websiteURL,
      websiteKey,
      pageAction:  action || 'signup',
    },
  });

  if (createRes.errorId !== 0) {
    console.log('  [CAP] Error: ' + createRes.errorDescription);
    return null;
  }

  const taskId = createRes.taskId;
  for (let i = 0; i < 40; i++) {
    await delay(3000);
    const res = await capsolverPost('/getTaskResult', { clientKey: apiKey, taskId });
    if (res.status === 'ready') {
      console.log('  [CAP] Solved!');
      return res.solution.gRecaptchaResponse;
    }
    if (res.errorId !== 0) {
      console.log('  [CAP] Error: ' + res.errorDescription);
      return null;
    }
  }
  console.log('  [CAP] Timeout solving captcha');
  return null;
}

// ===================== HELPERS =====================

const delay     = ms     => new Promise(r => setTimeout(r, ms));
const randDelay = (a, b) => delay(Math.floor(Math.random() * (b - a) + a));

function askQuestion(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(q, ans => { rl.close(); resolve(ans.trim()); }));
}

const FIRST = ['James','Emma','Liam','Olivia','Noah','Ava','William','Sophia','Benjamin','Isabella','Lucas','Mia'];
const LAST  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Martinez'];
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];

function generateFakeName() { return pick(FIRST) + ' ' + pick(LAST); }

function generatePassword() {
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  return ('A1!' + Array.from({ length: 9 }, () => pool[Math.floor(Math.random() * pool.length)]).join(''))
    .split('').sort(() => Math.random() - 0.5).join('');
}

function saveAccount(email, password) {
  const line = email + ':' + password + '\n';
  fs.appendFileSync(config.ACCOUNTS_FILE, line, 'utf8');
}

// ===================== PAGE HELPERS =====================

async function typeInto(page, selectors, value, timeout) {
  timeout = timeout || 5000;
  const deadline = Date.now() + timeout;
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
  timeoutMs = timeoutMs || 10000;
  const deadline = Date.now() + timeoutMs;
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
        const txt = await el.evaluate(n => n.textContent.trim());
        return txt;
      } catch (_) { /* retry */ }
    }
    await delay(200);
  }
  return null;
}

// ===================== CORE FLOW =====================

async function redeemAccount(cycleNum, total) {
  const email    = generateEmail();
  const password = settings.PASSWORD || generatePassword();
  const name     = generateFakeName();
  const age      = String(Math.floor(Math.random() * 10) + 20);

  const W   = '  [#' + cycleNum + '/' + total + ']';
  const log = (msg) => console.log(W + ' ' + msg);

  console.log('\n' + W + ' \u2500\u2500 Akun #' + cycleNum + ' \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  log('Email : ' + email);
  log('Pass  : ' + password);

  let browser          = null;
  let page             = null;
  let usingRealBrowser = false;
  let capturedSiteKey  = null;

  try {
    // ── Launch Browser ───────────────────────────────────────
    if (config.HEADLESS) {
      browser = await puppeteerExtra.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const pages = await browser.pages();
      page = pages[0] || await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      log('[browser] puppeteer-extra headless siap');
    } else {
      try {
        const rb = await connect({
          headless:      false,
          args:          [],
          customConfig:  {},
          skipTarget:    [],
          fingerprint:   true,
          turnstile:     true,
          connectOption: { defaultViewport: { width: 1280, height: 900 } },
          disableXvfb:   true,
          ignoreAllFlags: false,
        });
        browser          = rb.browser;
        page             = rb.page;
        usingRealBrowser = true;
        await page.setViewport({ width: 1280, height: 900 });
        log('[browser] real-browser' + (settings.MINIMIZE_WINDOW ? ' (bg)' : '') + ' siap');
      } catch (rbErr) {
        log('[browser] fallback puppeteer-extra: ' + rbErr.message);
        browser = await puppeteerExtra.launch({
          headless: false,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const pages = await browser.pages();
        page = pages[0] || await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
      }
    }


    // Intercept siteKey dari request network
    page.on('request', req => {
      const url = req.url();
      const m   = url.match(/render=([^&"]+)/);
      if (m && m[1] !== 'explicit' && !capturedSiteKey) capturedSiteKey = m[1];
    });

    // ── STEP 1: Buka URL redeem ──────────────────────────────
    log('[1/5] Buka halaman redeem...');
    await page.goto(config.REDEEM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000);

    // ── STEP 2: Klik CLAIM OFFER ─────────────────────────────
    log('[2/5] CLAIM OFFER...');
    const claimClicked = await clickNative(page, ['CLAIM OFFER', 'CLAIM', 'ACTIVATE', 'REDEEM'], 12000);
    if (!claimClicked) {
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300)).catch(() => '');
      log('[WARN] CLAIM OFFER tidak ditemukan. Page text: ' + bodyText);
      throw new Error('Tombol CLAIM OFFER tidak ditemukan');
    }
    await randDelay(800, 1500);

    // Minimize setelah CLAIM OFFER biar gak ganggu render awal
    if (settings.MINIMIZE_WINDOW) {
      try {
        const session = await page.target().createCDPSession();
        const { windowId } = await session.send('Browser.getWindowForTarget');
        await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
        log('Window minimized');
      } catch (_) { /* skip */ }
    }

    // ── STEP 3: Isi Age → klik NEXT ──────────────────────────
    // Setelah klik CLAIM OFFER, Duolingo munculkan modal "How old are you?"
    log('[3/5] Isi Age (' + age + ') dan NEXT...');
    const ageOk = await typeInto(page, [
      '[data-test="age-input"]',
      'input[placeholder="Age"]',
      'input[placeholder*="age" i]',
      'input[name="age"]',
      'input[type="number"]',
    ], age, 8000);
    if (!ageOk) throw new Error('Field Age tidak ditemukan');
    await randDelay(600, 900);

    await clickNative(page, ['NEXT'], 5000);
    await randDelay(2000, 3000);

    log('[4/5] Isi form registrasi...');

    await typeInto(page, [
      '[data-test="name-input"]',
      'input[name="name"]',
      'input[placeholder*="name" i]',
    ], name, 4000);
    await randDelay(300, 500);

    // Email
    const emailOk = await typeInto(page, [
      '[data-test="email-input"]',
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="email" i]',
    ], email, 6000);
    if (!emailOk) throw new Error('Field email tidak ditemukan');
    await randDelay(300, 500);

    // Password
    const passOk = await typeInto(page, [
      '[data-test="password-input"]',
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="password" i]',
    ], password, 6000);
    if (!passOk) throw new Error('Field password tidak ditemukan');
    await randDelay(500, 800);

    log('Submit CREATE ACCOUNT...');
    const signedUp = await clickNative(page, [
      'CREATE ACCOUNT', 'SIGN UP', 'CREATE PROFILE', 'REGISTER',
    ], 6000);
    if (!signedUp) await page.keyboard.press('Enter');
    await delay(3000);

    // ── Cek hasil ────────────────────────────────────────────
    let superActivated = false;
    const pageUrl  = page.url();
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase()).catch(() => '');

    if (
      pageUrl.includes('/learn') ||
      pageUrl.includes('/home') ||
      pageUrl.includes('/dashboard') ||
      pageText.includes('already on super') ||
      pageText.includes("you've activated") ||
      pageText.includes("you're already") ||
      pageText.includes('super is now active') ||
      pageText.includes('congratulations') ||
      pageText.includes('activated')
    ) {
      superActivated = true;
    }

    if (!superActivated) {
      const stillOnForm = await page.evaluate(() => {
        const email = document.querySelector('input[type="email"]');
        const pass  = document.querySelector('input[type="password"]');
        return !!(email || pass);
      }).catch(() => false);
      if (!stillOnForm && !pageText.includes('create your profile') && !pageUrl.includes('isLoggingIn')) {
        superActivated = true;
        log('[OK] Form hilang, kemungkinan sukses');
      }
    }

    if (!superActivated && (pageText.includes('create your profile') || pageUrl.includes('isLoggingIn'))) {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn  = btns.find(b => {
          const t = (b.textContent || '').toUpperCase().trim();
          return t.includes('CREATE ACCOUNT') || t.includes('SIGN UP');
        });
        if (btn) { btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }
      });
      await delay(4000);
      const retryUrl  = page.url();
      const retryText = await page.evaluate(() => document.body.innerText.toLowerCase()).catch(() => '');
      if (
        retryUrl.includes('/learn') || retryUrl.includes('/home') ||
        retryText.includes('already on super') || retryText.includes("you've activated")
      ) {
        superActivated = true;
      }
    }

    // ── Simpan hasil ─────────────────────────────────────────
    if (superActivated) {
      console.log('\n' + W + ' [SUKSES] ' + email + ' | ' + password);
    } else {
      log('[trace] ' + pageUrl + ' | ' + pageText.substring(0, 200).replace(/\n/g, ' '));
      console.log('\n' + W + ' [CEK MANUAL] ' + email);
    }
    saveAccount(email, password);
    if (superActivated) await delay(3000);

  } catch (err) {
    console.error('\n' + W + ' [ERROR] ' + err.message);
    saveAccount(email, password);
  } finally {
    try { if (page) await page.close(); } catch (_) {}
    if (!usingRealBrowser && browser) {
      try { await browser.close(); } catch (_) {}
    }
  }
}

// ===================== CONCURRENCY POOL =====================

async function runWithConcurrency(total, concurrency) {
  let started   = 0;
  let completed = 0;
  const running = new Set();

  return new Promise((resolve) => {
    let spawnIndex = 0;

    function spawnNext() {
      while (running.size < concurrency && started < total) {
        started++;
        const cycleNum = started;
        const spawnDelay = spawnIndex * 3000; // jeda 3 detik antar browser
        spawnIndex++;

        const task = delay(spawnDelay).then(() => {
          console.log('\n  [SPAWN] Worker #' + cycleNum + ' start (' + (running.size) + '/' + concurrency + ' running)');
          return redeemAccount(cycleNum, total);
        }).finally(() => {
          running.delete(task);
          completed++;
          console.log('\n  [DONE] Worker #' + cycleNum + ' selesai (' + completed + '/' + total + ')');
          spawnIndex = 0; // reset agar slot kosong langsung diisi
          spawnNext();
          if (completed === total) resolve();
        });

        running.add(task);
      }
    }

    spawnNext();
  });
}

// ===================== ENTRY POINT =====================

async function runBot() {
  console.log('\n=========================================');
  console.log('   BOT DUOLINGO REDEEM - FULL AUTO');
  console.log('   Author: @Drosek');
  console.log('=========================================\n');

  const hasCustomDomains = process.env.CUSTOM_DOMAINS && process.env.CUSTOM_DOMAINS.trim().length > 0;
  if (hasCustomDomains) {
    console.log('  Domain  : ' + process.env.CUSTOM_DOMAINS);
  } else if (config.EMAIL_DOMAIN) {
    console.log('  Domain  : @' + config.EMAIL_DOMAIN);
  }

  const jawaban    = await askQuestion('  Mau buat berapa akun?      ');
  const total      = Math.max(1, parseInt(jawaban) || 1);

  const jawabanMax = await askQuestion('  Max paralel (max 5, default 5): ');
  const concurrency = Math.min(Math.max(1, parseInt(jawabanMax) || 5), 5); // max 5

  console.log('\n  Total   : ' + total + ' akun');
  console.log('  Paralel : ' + concurrency + ' browser sekaligus\n');

  if (!fs.existsSync(config.ACCOUNTS_FILE)) {
    fs.writeFileSync(config.ACCOUNTS_FILE, '# email:password\n', 'utf8');
  }

  await runWithConcurrency(total, concurrency);

  console.log('\n=========================================');
  console.log('   SELESAI! Cek accounts.txt');
  console.log('=========================================\n');
}


runBot().catch(console.error);
