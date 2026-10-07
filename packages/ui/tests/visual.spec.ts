import { expect, test } from '@playwright/test';

for (const [name, id, trigger] of [
  ['controls', 'patterns-componentgallery--controls', ''],
  ['form', 'patterns-componentgallery--form', ''],
  ['dialog', 'primitives-dialog--default', 'Open dialog'],
  ['sheet', 'primitives-sheet--right', 'Open sheet'],
  ['tooltip', 'components-tooltip--default', 'Details'],
] as const) {
  test(name, async ({ page }) => {
    await page.goto(`/iframe.html?id=${id}&viewMode=story`);
    await expect(page.locator('#storybook-root > main')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (trigger) {
      if (name === 'tooltip') await page.getByRole('button', { name: trigger }).focus();
      else await page.getByRole('button', { name: trigger }).click();
      await expect(page.getByRole(name === 'tooltip' ? 'tooltip' : 'dialog')).toBeVisible();
    }
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.001 });
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => window.innerWidth));
  });
}

test('native slider keyboard', async ({ page }) => {
  await page.goto('/iframe.html?id=primitives-range--stepped&viewMode=story');
  const slider = page.getByRole('slider');
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('80');
  await slider.press('Home');
  await expect(slider).toHaveValue('0');
});

test('documentation renders semantic actions on the dark canvas', async ({ page }) => {
  await page.goto('/iframe.html?id=primitives-button--docs&viewMode=docs');
  await expect(page.getByRole('heading', { name: 'Button', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'variant', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'size', exact: true })).toBeVisible();
  const canvas = page.locator('.docs-story').first();
  await expect(canvas).toHaveCSS('background-color', 'rgb(8, 8, 8)');
});

test('reduced motion disables overlay and tooltip animation', async ({ page }) => {
  await page.goto('/iframe.html?id=primitives-sheet--left&viewMode=story');
  await page.getByRole('button', { name: 'Open from left' }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('animation-name', 'none');
  await page.goto('/iframe.html?id=components-tooltip--default&viewMode=story');
  await page.getByRole('button', { name: 'Details' }).focus();
  await expect(page.getByRole('tooltip')).toHaveCSS('animation-name', 'none');
});

test('text and meaningful control boundaries meet contrast minimums', async ({ page }) => {
  await page.goto('/iframe.html?id=patterns-componentgallery--controls&viewMode=story');
  const contrast = await page.getByRole('textbox', { name: 'Email address' }).evaluate((control) => {
    const style = getComputedStyle(control);
    const rgb = (color: string) => color.match(/[\d.]+/g)!.map(Number);
    const background = rgb(style.backgroundColor);
    const border = rgb(style.borderTopColor);
    const alpha = border[3] ?? 1;
    const effectiveBorder = border.slice(0, 3).map((value, i) => value * alpha + background[i] * (1 - alpha));
    const luminance = (channels: number[]) => channels.slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((total, channel, i) => total + channel * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a: number[], b: number[]) => {
      const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    return { text: ratio(rgb(style.color), background), border: ratio(effectiveBorder, background) };
  });
  expect(contrast.text).toBeGreaterThanOrEqual(4.5);
  expect(contrast.border).toBeGreaterThanOrEqual(3);
});
