import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [storybookTest({ configDir: fileURLToPath(new URL('./.storybook', import.meta.url)) })],
  test: {
    name: 'ui-browser',
    browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: 'chromium' }] },
    coverage: {
      provider: 'v8', reportsDirectory: '../../coverage/ui-browser',
      include: ['src/components/**/*.tsx', 'src/utils.ts'],
      exclude: ['**/*.stories.tsx', '**/*.test.tsx'],
      thresholds: { statements: 75, branches: 60, functions: 70, lines: 75 },
    },
  },
});
