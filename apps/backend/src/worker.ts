import { startInlineWorker } from './queues';
import { logger } from './utils/logger';

export function startWorkers() {
  logger.info('Starting inline job worker...');
  startInlineWorker();
}

if (require.main === module) {
  startWorkers();
  process.stdin.resume();
}
