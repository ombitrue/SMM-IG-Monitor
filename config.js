// config.js — единая точка чтения и валидации .env
require('dotenv').config();

const config = {
  port:        Number(process.env.PORT) || 5050,
  rapidApiKey: process.env.RAPIDAPI_KEY || null,
  apiHost:     process.env.RAPIDAPI_HOST       || 'instagram-statistics-api.p.rapidapi.com',
  endpoint:    process.env.RAPIDAPI_ENDPOINT    || '/community',
  paramName:   process.env.RAPIDAPI_PARAM_NAME  || 'url',
  paramMode:   process.env.RAPIDAPI_PARAM_MODE  || 'url',
  authHeader:  process.env.RAPIDAPI_AUTH_HEADER || 'X-RapidAPI-Key',
  hostHeader:  process.env.RAPIDAPI_HOST_HEADER || 'X-RapidAPI-Host',
  mockApi:     process.env.MOCK_API === 'true',
  dbPath:      process.env.DB_PATH || './data.sqlite',
};

function validate() {
  const problems = [];
  if (String(config.port) === '5000')
    problems.push('PORT=5000 конфликтует с AirPlay Receiver на macOS — используйте 5050.');
  if (!config.mockApi && !config.rapidApiKey)
    problems.push('RAPIDAPI_KEY не задан и MOCK_API не включён — реальные запросы не будут работать.');
  if (config.mockApi && config.rapidApiKey)
    problems.push('MOCK_API=true при заданном RAPIDAPI_KEY — ключ сейчас игнорируется.');
  if (problems.length) {
    console.warn('\n⚠️  Проблемы конфигурации (.env):');
    problems.forEach(p => console.warn('   - ' + p));
    console.warn('');
  }
  return problems;
}

module.exports = { config, validate };
