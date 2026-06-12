require('dotenv').config();

const code = (process.env.REDEEM_CODE || 'DUOBNBJUNE2026').trim();

module.exports = {
  REDEEM_URL: 'https://www.duolingo.com/redeem?code=' + code,
  EMAIL_DOMAIN: (process.env.EMAIL_DOMAIN || 'trivoxy.xyz').trim(),
  DELAY_BETWEEN_ACCOUNTS: parseInt(process.env.DELAY_BETWEEN_ACCOUNTS) || 3000,
  ACCOUNTS_FILE: (process.env.ACCOUNTS_FILE || './accounts.txt').trim(),
  HEADLESS: process.env.HEADLESS === 'true',
};
