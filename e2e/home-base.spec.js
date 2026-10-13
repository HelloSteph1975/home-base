const { test, expect } = require('@playwright/test');

test('the four tabs and Settings open', async ({ page }) => {
  await page.goto('/');
  for (const [tab, title] of [['Calendar', 'Calendar'], ['Homes', 'Homes'], ['Bills', 'Bills'], ['Today', 'Today']]) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: tab }).click();
    await expect(page).toHaveTitle(`${title} · Home Base`);
  }
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveTitle('Settings · Home Base');
});

test('Today greets Sam and lists what needs doing', async ({ page }) => {
  await page.goto('/#/today');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sam');
  const chores = page.locator('section', { has: page.getByRole('heading', { name: 'Chores due' }) });
  const filter = chores.locator('li', { hasText: 'Change air filter' });
  await expect(filter).toContainText('Main house');
  await filter.getByRole('button', { name: 'Done' }).click();
  await expect(chores.locator('li', { hasText: 'Change air filter' })).toHaveCount(0);
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Bills' }) })).toContainText('Water');
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Coming up' }) })).toContainText('Dentist');
});

test('Calendar: month, week and day views; add an event', async ({ page }) => {
  await page.goto('/#/calendar');
  await expect(page.locator('.month .cell.today')).toHaveCount(1);
  await page.getByRole('link', { name: 'Week', exact: true }).click();
  await expect(page.locator('.week .col')).toHaveCount(7);
  await page.getByRole('button', { name: '+ Event' }).click();
  await page.getByLabel('What').fill('Garden club');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: 'Day', exact: true }).click();
  await expect(page.getByRole('button', { name: /Garden club/ })).toBeVisible();
});

test('Homes: add a home and a chore, then mark it done', async ({ page }) => {
  await page.goto('/#/homes');
  await expect(page.getByRole('heading', { name: 'Main house' })).toBeVisible();
  await page.getByRole('button', { name: '+ Add a home' }).click();
  await page.getByLabel('Name').fill('Beach house');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Beach house', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: '+ Add chore' }).click();
  await page.getByLabel('Chore').fill('Sweep the deck');
  await page.getByRole('button', { name: 'Save' }).click();
  const row = page.locator('li', { hasText: 'Sweep the deck' });
  await expect(row.locator('.pill')).toHaveText('today');
  await row.getByRole('button', { name: 'Done' }).click();
  await expect(row.locator('.pill')).toHaveText('in 7 days');
});

test('Homes: projects and notes tabs', async ({ page }) => {
  await page.goto(`/#/homes/${encodeURIComponent('Main house')}/projects`);
  await expect(page.getByText('Paint the porch').first()).toBeVisible();
  await page.getByLabel('New task for Paint the porch').fill('Buy brushes');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Buy brushes')).toBeVisible();
  await page.getByRole('link', { name: 'Notes' }).click();
  await expect(page.getByLabel('Notes for Main house')).toHaveValue(/Water shut-off/);
});

test('Homes on a phone: list first, then the detail with a back link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/homes');
  await page.getByRole('link', { name: /Lake cabin/ }).click();
  await expect(page.getByRole('link', { name: '← All homes' })).toBeVisible();
  await expect(page.getByText('Drain the pipes')).toBeVisible();
  await page.getByRole('link', { name: '← All homes' }).click();
  await expect(page.getByRole('link', { name: /Grandma's place/ })).toBeVisible();
});

test('Bills: totals, mark paid, undo', async ({ page }) => {
  await page.goto('/#/bills');
  await expect(page.getByRole('heading', { name: 'Still due this month' })).toBeVisible();
  const thisMonth = page.locator('section', { has: page.getByRole('heading', { name: 'This month' }) });
  const paidBefore = await thisMonth.locator('.pill.paid').count();
  await thisMonth.getByRole('button', { name: 'Mark paid' }).first().click();
  await expect(thisMonth.locator('.pill.paid')).toHaveCount(paidBefore + 1);
  await thisMonth.getByRole('button', { name: 'Undo' }).first().click();
  await expect(thisMonth.locator('.pill.paid')).toHaveCount(paidBefore);
  await page.getByRole('button', { name: '+ Add bill' }).click();
  await page.getByLabel('Bill', { exact: true }).fill('Trash pickup');
  await page.getByLabel('Amount').fill('30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('cell', { name: 'Trash pickup' })).toBeVisible();
});

test('Settings: name, backup now, see changes', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByLabel('Your name').fill('Samantha');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Samantha');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByRole('status')).toHaveText('Backed up.');
  await expect(page.getByText(/Last backup:/)).toBeVisible();
  await page.getByRole('button', { name: 'See what changed' }).click();
  await expect(page.getByText(/Nothing has changed since that backup|changed since then|added since then/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
});

test('switching tabs quickly never shows the page you left', async ({ page }) => {
  await page.route('**/api/homes', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await page.goto('/#/homes');
  await page.evaluate(() => { location.hash = '#/bills'; });
  await expect(page.getByRole('heading', { name: 'Still due this month' })).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(page.getByRole('heading', { name: 'Still due this month' })).toBeVisible();
  await expect(page).toHaveURL(/#\/bills$/);
});
