import { app } from './app.js';
import { config, missingLlmVariables } from './lib/config.js';
import { logger } from './lib/logger.js';

app.listen(config.port, (error) => {
  if (error) {
    logger.fatal({ err: error, port: config.port }, 'server failed to start');
    process.exitCode = 1;
    return;
  }
  logger.info(
    {
      port: config.port,
      ai: config.aiStatus,
      trustProxy: config.trustProxy ?? false,
    },
    'API listening',
  );
  const missing = missingLlmVariables(config);
  if (missing.length > 0) {
    logger.warn(
      { missing },
      'AI partly configured and unavailable; set the missing variables',
    );
  }
});
