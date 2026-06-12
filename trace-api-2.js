/**
 * Trace API Signup & Redeem — interaksi penuh, intercept semua request.
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const REDEEM_URL = 'https://www.duolingo.com/redeem?code=DUOBNBJUNE2026';
const EMAIL = 'trace' + Date.now() + '@trivoxy.xyz';
const PASSWORD = 'Test123!@#pass';
const NAME = 'John Smith';
const AGE = '25';

(async () => {
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  const [page] = await browser.pages();
  await page.setViewport({ width: 1280, height: 900 });

  // Intercept API requests (bukan analytics/gstatic/etc)
  page.on('request', req => {
    const url = req.url();
    const method = req.method();
    // Filter cuma endpoint Duolingo API yg relevan
    if (url.includes('duolingo.com/2017-06-30') || url.includes('duolingo.com/2023-05-23') || url.includes('/users/') && !url.includes('undefined')) {
      console.log('\n>>> [' + method + '] ' + url.split('?')[0]);
      const postData = req.postData();
      if (postData) {
        try { console.log('  Payload:', JSON.stringify(JSON.parse(postData), null, 2)); } catch (_) { console.log('  Payload:', postData); }
      }
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('duolingo.com') && (url.includes('/2017-06-30/') || url.includes('/2023-05-23/') || url.includes('/users/'))) {
      let body;
      try { 
        const txt = await res.text();
        try { body = JSON.parse(txt); } catch (_) { body = txt.substring(0, 500); }
      } catch (_) { body = null; }
      console.log('<<< [' + res.status() + '] ' + url.split('?')[0]);
      if (body) console.log('  Response:', JSON.stringify(body, null, 2).substring(0, 1000));
    }
  });

  // 1. Buka redeem page
  console.log('\n=== Langkah 1: Buka redeem page ===');
  await page.goto(REDEEM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  // 2. Klik CLAIM OFFER
  console.log('\n=== Langkah 2: Klik CLAIM OFFER ===');
  const claimBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const kw = ['CLAIM OFFER', 'CLAIM', 'ACTIVATE', 'REDEEM'];
    return btns.find(b => {
      const t = (b.textContent || '').trim().toUpperCase();
      return kw.some(k => t === k || t.includes(k));
    }) || null;
  });
  if (claimBtn.asElement()) {
    await claimBtn.asElement().click({ delay: 80 });
    console.log('  CLAIM OFFER clicked');
  } else {
    console.log('  CLAIM OFFER button not found, trying page click...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => /claim|activate|redeem/i.test(b.textContent));
      if (btn) btn.click();
    });
  }
  await new Promise(r => setTimeout(r, 3000));

  // 3. Isi AGE
  console.log('\n=== Langkah 3: Isi AGE ===');
  const ageSelectors = ['[data-test="age-input"]', 'input[placeholder="Age"]', 'input[placeholder*="age" i]', 'input[name="age"]', 'input[type="number"]'];
  for (const sel of ageSelectors) {
    try {
      const el = await page.waitForSelector(sel, { timeout: 2000, visible: true });
      if (el) {
        await el.click();
        await el.type(AGE, { delay: 80 });
        console.log('  Age filled using:', sel);
        break;
      }
    } catch (_) {}
  }
  await new Promise(r => setTimeout(r, 1000));

  // Klik NEXT
  console.log('\n=== Langkah 4: Klik NEXT ===');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => /^next$/i.test(b.textContent.trim()));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 3000));

  // 5. Isi form registrasi
  console.log('\n=== Langkah 5: Isi form registrasi ===');
  
  // Name
  for (const sel of ['[data-test="name-input"]', 'input[name="name"]', 'input[placeholder*="name" i]']) {
    try {
      const el = await page.waitForSelector(sel, { timeout: 2000, visible: true });
      if (el) { await el.click(); await el.type(NAME, { delay: 60 }); console.log('  Name filled:', sel); break; }
    } catch (_) {}
  }
  await new Promise(r => setTimeout(r, 500));

  // Email
  for (const sel of ['[data-test="email-input"]', 'input[type="email"]', 'input[name="email"]']) {
    try {
      const el = await page.waitForSelector(sel, { timeout: 2000, visible: true });
      if (el) { await el.click(); await el.type(EMAIL, { delay: 60 }); console.log('  Email filled:', sel); break; }
    } catch (_) {}
  }
  await new Promise(r => setTimeout(r, 500));

  // Password
  for (const sel of ['[data-test="password-input"]', 'input[type="password"]', 'input[name="password"]']) {
    try {
      const el = await page.waitForSelector(sel, { timeout: 2000, visible: true });
      if (el) { await el.click(); await el.type(PASSWORD, { delay: 60 }); console.log('  Password filled:', sel); break; }
    } catch (_) {}
  }
  await new Promise(r => setTimeout(r, 1000));

  // 6. Klik CREATE ACCOUNT
  console.log('\n=== Langkah 6: CREATE ACCOUNT ===');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => /create account|sign up|register/i.test(b.textContent));
    if (btn) btn.click();
  });

  // Tunggu request signup terkirim
  console.log('\n=== Menunggu 15 detik untuk request signup... ===');
  await new Promise(r => setTimeout(r, 15000));

  console.log('\n\n========================================');
  console.log('SELESAI! Cek output di atas untuk endpoint & payload signup.');
  console.log('========================================\n');

  await browser.close();
})();
