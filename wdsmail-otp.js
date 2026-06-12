const config = require('./config');

const CUSTOM_DOMAINS = process.env.CUSTOM_DOMAINS
  ? process.env.CUSTOM_DOMAINS.split(',').map(d => d.trim()).filter(Boolean)
  : [];

function generateEmail() {
  let domain;
  if (CUSTOM_DOMAINS.length > 0) {
    domain = CUSTOM_DOMAINS[Math.floor(Math.random() * CUSTOM_DOMAINS.length)];
  } else if (config.EMAIL_DOMAIN) {
    domain = config.EMAIL_DOMAIN;
  } else {
    throw new Error('Isi CUSTOM_DOMAINS atau EMAIL_DOMAIN di .env');
  }

  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let local = '';
  for (let i = 0; i < 13; i++) local += chars[Math.floor(Math.random() * chars.length)];
  return local + '@' + domain;
}

module.exports = { generateEmail };
