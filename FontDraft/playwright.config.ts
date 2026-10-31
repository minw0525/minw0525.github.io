import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5173', browserName: process.env.FONTDRAFT_WEBKIT ? 'webkit' : 'chromium', channel: process.env.FONTDRAFT_WEBKIT ? undefined : 'chrome', hasTouch: !!process.env.FONTDRAFT_WEBKIT, viewport: { width: 1194, height: 834 }, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
});
