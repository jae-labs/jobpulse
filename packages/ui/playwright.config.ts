import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  snapshotPathTemplate: '{testDir}/visual/{platform}/{projectName}/{arg}{ext}',
  use: { baseURL: 'http://127.0.0.1:6007', colorScheme: 'dark', contextOptions: { reducedMotion: 'reduce' }, locale: 'en-GB', deviceScaleFactor: 1 },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 320, height: 760 } } },
  ],
  webServer: {
    command: 'node ../../scripts/serve-storybook.mjs', url: 'http://127.0.0.1:6007/index.json', reuseExistingServer: false,
  },
});
