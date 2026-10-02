import fs from 'node:fs';
import { config } from './config.js';
import { createApp } from './app.js';
import { startJobs } from './jobs/dueTasks.js';

fs.mkdirSync(config.uploadDir, { recursive: true });
createApp().listen(config.port, () => {
  console.log(`API LavaControl escuchando en http://localhost:${config.port}`);
});
startJobs();
