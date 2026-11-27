import { expect, test, type Page } from '@playwright/test';

import fixture from './fixture.json' with { type: 'json' };

const { owner, outsider, password, program } = fixture;

async function signIn(page: Page, account: typeof owner) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible();
}

test('an owner can inspect a board and review it while other workspaces are isolated', async ({ page, browser, baseURL }) => {
  await signIn(page, owner);
  const navigation = page.getByRole('navigation', { name: 'Modules' });
  await navigation.getByRole('link', { name: 'Inspection programs' }).click();
  await page.getByRole('link', { name: new RegExp(program.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/programs/${program.id}$`));
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Program name' })).toHaveValue(program.name);
  await page.getByRole('link', { name: 'Open operator screen' }).click();
  await expect(page.getByLabel('Active program')).toHaveValue(program.id);
  await expect(page.getByText('Live revision 1')).toBeVisible();

  // Use a real browser-encoded JPEG, without camera hardware or a production photo.
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    return canvas.toDataURL('image/jpeg').split(',')[1];
  });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload board photo' }).click();
  await (await chooserPromise).setFiles({
    name: 'smoke-label.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64'),
  });
  await expect(page.getByRole('heading', { name: 'Set this board aside for review.' })).toBeVisible();

  await navigation.getByRole('link', { name: /Results and review/ }).click();
  const waiting = page.getByRole('link', { name: /Shipping label inspection.*Waiting for review/ });
  await expect(waiting).toBeVisible();
  await waiting.click();
  const detail = page.getByRole('region', { name: 'Result details' });
  await detail.getByLabel('Note (optional)').fill('Smoke test confirmed the flagged board.');
  await detail.getByRole('button', { name: 'Yes, correct' }).click();
  await expect(waiting).toHaveCount(0);
  await expect(detail.getByText(/Model was right/)).toBeVisible();
  await page.reload();
  await expect(detail.getByLabel('Note (optional)')).toHaveValue('Smoke test confirmed the flagged board.');

  const runId = new URL(page.url()).pathname.split('/').at(-1)!;
  expect(runId).toMatch(/^[0-9a-f-]{36}$/);
  const otherContext = await browser.newContext({ baseURL });
  try {
    const other = await otherContext.newPage();
    await signIn(other, outsider);
    await other.goto(`/results/${runId}`);
    await expect(other.getByText('Inspection result not found', { exact: true })).toBeVisible();
    const foreign = `/api/v1/organisations/${owner.workspaceId}`;
    const own = `/api/v1/organisations/${outsider.workspaceId}`;
    for (const [prefix, status] of [[foreign, 403], [own, 404]] as const) {
      expect((await other.request.get(`${prefix}/inspection-programs/${program.id}`)).status()).toBe(status);
      expect((await other.request.get(`${prefix}/inspection-runs/${runId}`)).status()).toBe(status);
      expect((await other.request.get(`${prefix}/inspection-runs/${runId}/image`)).status()).toBe(status);
      const deniedInspection = await other.request.post(`${prefix}/inspection-programs/${program.id}/runs`, {
        headers: { Origin: baseURL!, 'Content-Type': 'image/jpeg' },
        data: Buffer.from(jpeg, 'base64'),
      });
      expect(deniedInspection.status()).toBe(status);
      const deniedReview = await other.request.post(`${prefix}/inspection-runs/${runId}/review`, {
        headers: { Origin: baseURL! },
        data: { status: 'corrected', note: 'Outside workspace' },
      });
      expect(deniedReview.status()).toBe(status);
    }
  } finally {
    await otherContext.close();
  }
});


test('a new project can use simple label names and adjust training settings', async ({ page }) => {
  await signIn(page, owner);
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Project name').fill('Setup test');
  await page.getByRole('button', { name: 'Continue to set up' }).click();
  await expect(page.getByRole('heading', { name: 'Define your inspection' })).toBeVisible();
  await page.getByRole('button', { name: 'Use this example' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Box label check');
  await page.getByRole('button', { name: 'Continue to photos' }).click();
  await expect(page.getByRole('heading', { name: 'Add photos' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Straight label', { exact: true }).first()).toBeVisible();
  await page.getByRole('list', { name: 'Project steps' }).getByRole('link', { name: /Train/ }).click();
  await expect(page.getByRole('heading', { name: 'Configure training' })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Training passes' }).fill('50');
  await page.getByRole('spinbutton', { name: 'Validation photos (%)' }).fill('25');
  await expect(page.getByText('65% / 25% / 10%', { exact: true })).toBeVisible();
  await page.getByText('Example settings for a fixed camera', { exact: true }).click();
  await page.getByRole('button', { name: 'Apply photo adjustments' }).click();
  await expect(page.getByRole('checkbox', { name: 'Use mirrored photos during training' })).not.toBeChecked();
  await expect(page.getByRole('slider', { name: /Brightness variety/ })).toHaveValue('0.15');
  await expect(page.getByRole('button', { name: 'Start training' })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});


test('clean and legacy links lead to the right screens', async ({ page }) => {
  await page.goto(`/#/programs/${program.id}`);
  await expect(page).toHaveURL(new RegExp(`/login\\?next=`));
  await expect(page.getByText('A workspace for visual inspection')).toBeVisible();
  await expect(page.getByText('Team workspaces', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Sign up', exact: true }).click();
  await expect(page).toHaveURL(/\/signup\?next=/);
  await expect(page.getByText('Results and review', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel('Email').fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/programs/${program.id}$`));
  await expect(page.getByRole('textbox', { name: 'Program name' })).toHaveValue(program.name);

  const placeholderToken = 'a'.repeat(43);
  await page.goto(`/reset#${placeholderToken}`);
  await expect(page).toHaveURL(/\/reset$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Save new password' })).toBeEnabled();
});
