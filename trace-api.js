/**
 * Trace Duolingo API endpoints — jalanin aja, dia bakal intercept semua request
 * ke duolingo.com/api dan nampilin endpoint + payload-nya.
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const REDEEM_URL = 'https://www.duolingo.com/redeem?code=DUOBNBJUNE2026';

(async () => {
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  const [page] = await browser.pages();
  await page.setViewport({ width: 1280, height: 900 });

  // Intercept SEMUA request ke duolingo
  const duolingoReqs = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('duolingo.com') && (req.method() === 'POST' || req.method() === 'PUT' || req.method() === 'GET')) {
      const entry = {
        method: req.method(),
        url: url,
        headers: req.headers(),
        postData: req.postData(),
      };
      duolingoReqs.push(entry);
      console.log('\n--- DUOLINGO REQUEST ---');
      console.log('METHOD:', entry.method);
      console.log('URL:', entry.url);
      if (entry.postData) console.log('BODY:', entry.postData);
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('duolingo.com') && url.includes('/2017-06-30/')) {
      let body;
      try { body = await res.json(); } catch (_) { try { body = await res.text(); } catch (_2) { body = null; } }
      console.log('\n--- DUOLINGO RESPONSE ---');
      console.log('URL:', url);
      console.log('STATUS:', res.status());
      if (body) console.log('BODY:', JSON.stringify(body, null, 2).substring(0, 2000));
    }
  });

  console.log('Navigating to:', REDEEM_URL);
  await page.goto(REDEEM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  console.log('\n=== Page loaded. Tunggu 30 detik untuk menangkap request... ===');
  console.log('Setelah itu script akan nampilin SEMUA endpoint Duolingo yang tertangkap.\n');
  
  await new Promise(r => setTimeout(r, 30000));

  console.log('\n\n========== ALL DUOLINGO API ENDPOINTS FOUND ==========');
  const seen = new Set();
  for (const r of duolingoReqs) {
    const key = r.method + ' ' + r.url.split('?')[0];
    if (!seen.has(key)) {
      seen.add(key);
      console.log('\n' + r.method + ' ' + r.url.split('?')[0]);
      if (r.postData) {
        try { console.log('  Body:', JSON.stringify(JSON.parse(r.postData), null, 2)); } catch (_) { console.log('  Body:', r.postData); }
      }
    }
  }

  await browser.close();
})();
