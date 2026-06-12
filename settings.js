require('dotenv').config();

module.exports = {
  PASSWORD: process.env.PASSWORD ? process.env.PASSWORD.trim() : null,
  CAPSOLVER_API_KEY: process.env.CAPSOLVER_API_KEY ? process.env.CAPSOLVER_API_KEY.trim() : null,
  MINIMIZE_WINDOW: process.env.MINIMIZE_WINDOW === 'true',
  DEFAULT_CONCURRENCY: Math.min(parseInt(process.env.DEFAULT_CONCURRENCY) || 3, 5),
};
