import { app } from './app.js';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';

app.listen(config.port, (error) => {
  if (error) {
    logger.fatal({ err: error, port: config.port }, 'server failed to start');
    process.exitCode = 1;
    return;
  }
  logger.info({ port: config.port, ai: config.aiStatus }, 'API listening');
});
