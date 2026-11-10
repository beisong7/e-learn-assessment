import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const demoPassword = process.env.E2E_DEMO_PASSWORD || 'password123';
async function signIn(page: Page, email = 'learner@app.com') {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(demoPassword);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(email === 'admin@app.com' ? '/admin' : '/dashboard');
  await expect(page.locator('dialog.welcome-tour')).toHaveCount(0);
}

// A CC0 MDN sample clip keeps real playback tests independent of network access.
test.beforeEach(async ({ page }) => {
  await page.route('**/flower.mp4', (route) => {
    const clip = readFileSync(path.resolve('tests/fixtures/flower.mp4'));
    const range = route
      .request()
      .headers()
      ['range']?.match(/bytes=(\d+)-(\d*)/);
    if (!range)
      return route.fulfill({
        body: clip,
        contentType: 'video/mp4',
        headers: { 'Accept-Ranges': 'bytes' },
      });
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), clip.length - 1) : clip.length - 1;
    return route.fulfill({
      status: 206,
      body: clip.subarray(start, end + 1),
      contentType: 'video/mp4',
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${clip.length}`,
        'Content-Length': String(end - start + 1),
      },
    });
  });
});

test('landing calls to action lead to a searchable, filterable catalog', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Big possibilities.');
  await page.getByRole('link', { name: 'Find your next skill' }).click();
  await expect(page).toHaveURL('/courses');
  await page.getByRole('button', { name: 'Development', exact: true }).click();
  await expect(page.locator('.course-card')).toHaveCount(1);
  await expect(page.locator('.course-card')).toContainText('Build for the Modern Web');
  await page.getByRole('textbox', { name: 'Search catalog' }).fill('no matching course');
  await expect(page.getByRole('heading', { name: 'No courses found' })).toBeVisible();
});

test('registration, enrollment, real video resume, and completion survive refresh', async ({
  page,
  browser,
}) => {
  const email = `auth-e2e-${process.env.E2E_RUN_ID}-${crypto.randomUUID()}@example.test`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Demo Student');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('fictional-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL('/dashboard');
  const guide = page.locator('dialog.welcome-tour');
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(guide.locator('.welcome-tour-spotlight')).toHaveAttribute('data-step', '/dashboard');
  await page.screenshot({ path: test.info().outputPath('welcome-desktop.png') });
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Explore courses', exact: true })).toBeVisible();
  await expect(guide.locator('.welcome-tour-spotlight')).toHaveAttribute('data-step', '/courses');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'My learning', exact: true })).toBeVisible();
  await expect(guide.locator('.welcome-tour-spotlight')).toHaveAttribute(
    'data-step',
    '/my-learning',
  );
  await guide.getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(guide).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Hello, Demo. Let’s grow.' })).toBeVisible();
  await page.goto('/courses/10000000-0000-4000-8000-000000000001');
  await page.getByRole('button', { name: 'Enroll in this course' }).click();
  await page.reload();
  await page.getByRole('link', { name: 'Continue learning', exact: true }).click();
  const video = page.locator('video');
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState))
    .toBeGreaterThanOrEqual(2);
  await video.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true;
    await element.play();
  });
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(1);
  await page.route('**/api/lessons/*/progress', (route) => route.abort());
  await video.evaluate((element: HTMLVideoElement) => element.pause());
  await expect(page.getByRole('alert')).toContainText('couldn’t reach the server');
  await page.unroute('**/api/lessons/*/progress');
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/progress') &&
      response.request().method() === 'PUT' &&
      response.ok(),
  );
  await page.getByRole('button', { name: 'Retry saved progress' }).click();
  await saved;
  const position = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThanOrEqual(position - 0.2);
  await video.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true;
    await element.play();
  });
  await expect(page.locator('.player-status')).toContainText('Completed', { timeout: 10_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.player-status')).toContainText('Completed');
  await page.getByRole('link', { name: 'Next lesson', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Research before you create');
  await page.goto('/dashboard');
  await expect(page.locator('.continue-feature')).toContainText('17% complete');
  await expect(page.locator('.stats-grid').getByText('01', { exact: true })).toHaveCount(2);
  await expect
    .poll(() => page.evaluate(() => JSON.stringify(localStorage)))
    .not.toContain('fictional-password');
  const reporting = await browser.newContext();
  try {
    const adminPage = await reporting.newPage();
    await signIn(adminPage, 'admin@app.com');
    await expect(
      adminPage.getByRole('heading', { name: 'Learner progress', exact: true }),
    ).toBeVisible();
    await expect(adminPage.getByRole('row').filter({ hasText: email })).toContainText('17%');
  } finally {
    await reporting.close();
  }
  expect(errors).toEqual([]);
});

test('admin can create, reorder, update, and delete course content in PostgreSQL', async ({
  page,
  browser,
}) => {
  const title = `content-e2e-${process.env.E2E_RUN_ID}-new`;
  const updatedTitle = `content-e2e-${process.env.E2E_RUN_ID}-updated`;
  await signIn(page, 'admin@app.com');
  await page.getByRole('link', { name: 'Manage courses', exact: true }).first().click();
  await page.getByRole('link', { name: 'Create course', exact: true }).click();
  await page.getByLabel('Course title', { exact: true }).fill(title);
  await page
    .getByLabel('Description', { exact: true })
    .fill('Learn something worthwhile in this browser test.');
  await page.getByLabel('Instructor name').fill('Demo Guide');
  await page
    .getByLabel('Thumbnail URL')
    .fill('https://images.unsplash.com/photo-1558655146-9f40138edfeb');
  await page.getByRole('button', { name: 'Add lesson' }).click();
  await page.getByLabel('Lesson title', { exact: true }).fill('First step');
  await page.getByRole('button', { name: 'Add lesson' }).click();
  await page.getByLabel('Lesson title', { exact: true }).nth(1).fill('Second step');
  await page.getByRole('button', { name: 'Move lesson 2 up' }).click();
  await expect(page.getByLabel('Lesson title', { exact: true }).first()).toHaveValue('Second step');
  await page.getByRole('button', { name: 'Create course', exact: true }).click();
  await expect(page.getByRole('table')).toContainText(title);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('link', { name: `Edit ${title}`, exact: true }).click();
  await page.getByLabel('Course title', { exact: true }).fill(updatedTitle);
  await page.getByRole('button', { name: 'Remove lesson 2', exact: true }).click();
  await page.route('**/api/admin/courses/*', (route) =>
    route.request().method() === 'PUT' ? route.abort() : route.continue(),
  );
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('couldn’t reach the server');
  await expect(page.getByLabel('Course title', { exact: true })).toHaveValue(updatedTitle);
  await page.unroute('**/api/admin/courses/*');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const visitor = await browser.newContext();
  try {
    const otherPage = await visitor.newPage();
    const result = await otherPage.request.get(
      `http://127.0.0.1:5174/api/courses?q=${encodeURIComponent(updatedTitle)}`,
    );
    const data = await result.json();
    expect(data.items[0].title).toBe(updatedTitle);
    const details = await otherPage.request.get(
      `http://127.0.0.1:5174/api/courses/${data.items[0].id}`,
    );
    expect((await details.json()).course.lessons[0].title).toBe('Second step');
  } finally {
    await visitor.close();
  }
  const row = page.getByRole('row').filter({ hasText: updatedTitle });
  await expect(row).toContainText('1');
  await page.getByRole('button', { name: `Delete ${updatedTitle}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Keep course' }).click();
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: `Delete ${updatedTitle}`, exact: true }).click();
  await page.getByRole('button', { name: 'Delete course', exact: true }).click();
  await expect(page.getByRole('table')).not.toContainText(updatedTitle);
});

test('learner cannot enter admin screens and unenrolled lessons show enrollment guidance', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/admin/courses');
  await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
  expect((await page.request.get('/api/admin/access')).status()).toBe(403);
  await page.goto(
    '/learn/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000101',
  );
  await expect(page.getByRole('heading', { name: 'Make this course yours first.' })).toBeVisible();
});

test('mobile layouts fit the viewport and workspace navigation opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    '/',
    '/courses',
    '/courses/10000000-0000-4000-8000-000000000001',
    '/dashboard',
    '/register',
  ]) {
    await page.goto(route);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `overflow on ${route}`,
    ).toBe(true);
  }
  await signIn(page);
  await page.goto('/courses');
  // The public catalog restores the session asynchronously after a full navigation.
  await expect(page.locator('.workspace-topbar .avatar')).toHaveText('DL');
  await page.getByRole('button', { name: 'Toggle workspace navigation' }).click();
  await expect(page.locator('.sidebar')).toHaveClass(/visible/);
  await page.getByRole('link', { name: 'My learning', exact: true }).click();
  await expect(page).toHaveURL('/my-learning');
  await expect(page.locator('.sidebar')).not.toHaveClass(/visible/);
});

test('seeded learner session survives reload and logout revokes access', async ({
  page,
  context,
}) => {
  await signIn(page);
  await expect(page.locator('.profile')).toContainText('Demo Learner');
  const cookies = await context.cookies();
  const cookie = cookies.find((c) => c.name === 'learnova_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000);
  // Forging the legacy preview user cannot change the server-authenticated role.
  await page.evaluate(() =>
    localStorage.setItem(
      'learnova-demo-v1',
      JSON.stringify({
        version: 1,
        user: { id: 'forged', role: 'admin' },
        courses: [],
        enrollments: [],
        progress: {},
      }),
    ),
  );
  await page.reload();
  await expect(page.locator('.profile')).toContainText('Demo Learner');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/login');
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
});

test('seeded admin can restore its session and access admin APIs', async ({ page }) => {
  await signIn(page, 'admin@app.com');
  await page.reload();
  await expect(page.locator('.profile')).toContainText('Demo Administrator');
  expect((await page.request.get('/api/admin/access')).status()).toBe(200);
  const state = await page.evaluate(() => JSON.stringify(localStorage));
  expect(state).not.toContain('password123');
  expect(state).not.toContain('passwordHash');
});

test('invalid credentials show an error and can be corrected', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('learner@app.com');
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await page.getByLabel('Password', { exact: true }).fill(demoPassword);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL('/dashboard');
});

test('cleared sessions redirect to login and API failures leave a retryable form', async ({
  page,
  context,
}) => {
  await signIn(page);
  await context.clearCookies();
  await page.reload();
  await expect(page).toHaveURL('/login');
  await page.route('**/api/auth/login', (route) => route.abort());
  await page.getByLabel('Email address').fill('learner@app.com');
  await page.getByLabel('Password', { exact: true }).fill(demoPassword);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('couldn’t reach the server');
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
});

test('catalog requests show retryable server errors and admin stale saves retain the draft', async ({
  page,
  context,
}) => {
  await page.route('**/api/courses?*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Course library temporarily unavailable.' } }),
    }),
  );
  await page.goto('/courses');
  await expect(page.getByRole('alert')).toHaveText('Course library temporarily unavailable.');
  await page.unroute('**/api/courses?*');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    page.locator('.course-card').filter({ hasText: 'UI/UX Design Fundamentals' }),
  ).toBeVisible();
  await signIn(page, 'admin@app.com');
  const title = `content-e2e-${process.env.E2E_RUN_ID}-concurrent`;
  const created = await page.request.post('/api/admin/courses', {
    headers: { Origin: 'http://127.0.0.1:5174' },
    data: {
      title,
      description: 'Concurrent editing example',
      category: 'DESIGN',
      thumbnailUrl: 'https://example.com/course.jpg',
      instructorName: 'Test guide',
      level: 'BEGINNER',
      outcomes: [],
      lessons: [],
    },
  });
  expect(created.status()).toBe(201);
  const { course } = await created.json();
  const second = await context.newPage();
  try {
    await page.goto(`/admin/courses/${course.id}/edit`);
    await second.goto(`/admin/courses/${course.id}/edit`);
    await expect(page.getByLabel('Course title', { exact: true })).toHaveValue(title);
    await expect(second.getByLabel('Course title', { exact: true })).toHaveValue(title);
    await page.getByLabel('Course title', { exact: true }).fill(title + '-saved');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page).toHaveURL('/admin/courses');
    await second.getByLabel('Course title', { exact: true }).fill(title + '-unsaved');
    await second.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(second.getByRole('alert')).toContainText('changed since you opened it');
    await expect(second.getByLabel('Course title', { exact: true })).toHaveValue(
      title + '-unsaved',
    );
    await second.getByRole('button', { name: 'Discard draft and reload latest' }).click();
    await expect(second.getByLabel('Course title', { exact: true })).toHaveValue(title + '-saved');
  } finally {
    await second.close();
    const latest = await page.request.get(`/api/admin/courses/${course.id}`);
    if (latest.ok()) {
      const current = await latest.json();
      const removed = await page.request.delete(`/api/admin/courses/${course.id}`, {
        headers: { Origin: 'http://127.0.0.1:5174' },
        data: { expectedVersion: current.course.version },
      });
      expect(removed.status()).toBe(204);
    }
  }
});

test('registration guide explains the three menu items on mobile without targeting hidden links', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Mobile Learner');
  await page
    .getByLabel('Email address')
    .fill(`auth-e2e-${process.env.E2E_RUN_ID}-${crypto.randomUUID()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('fictional-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL('/dashboard');
  const guide = page.locator('dialog.welcome-tour');
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(guide).toContainText('Open the menu at the top left');
  await expect(guide.locator('.welcome-tour-spotlight')).toHaveCount(0);
  await expect(page.locator('.sidebar')).not.toHaveClass(/visible/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('welcome-mobile.png') });
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Explore courses', exact: true })).toBeVisible();
  await expect(guide).toContainText('In the menu, choose Explore courses');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'My learning', exact: true })).toBeVisible();
  await expect(guide).toContainText('In the menu, choose My learning');
  await guide.getByRole('button', { name: 'Previous guide step' }).click();
  await expect(guide.getByRole('heading', { name: 'Explore courses', exact: true })).toBeVisible();
  await guide.getByRole('button', { name: 'Skip tour', exact: true }).click();
  await expect(guide).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hello, Mobile. Let’s grow.' })).toBeVisible();
  await expect(guide).toHaveCount(0);
});

test('admin manages learner access and courses and creates a separate administrator', async ({
  page,
  browser,
}) => {
  const learnerEmail = `auth-e2e-${process.env.E2E_RUN_ID}-${crypto.randomUUID()}@example.test`;
  const adminEmail = `auth-e2e-${process.env.E2E_RUN_ID}-${crypto.randomUUID()}@example.test`;
  const password = 'test-management-password';
  const learnerContext = await browser.newContext();
  try {
    const learnerPage = await learnerContext.newPage();
    const registered = await learnerPage.request.post('http://127.0.0.1:5174/api/auth/register', {
      headers: { Origin: 'http://127.0.0.1:5174' },
      data: { name: 'Managed Learner', email: learnerEmail, password },
    });
    expect(registered.status()).toBe(201);
    await learnerPage.request.post(
      'http://127.0.0.1:5174/api/courses/10000000-0000-4000-8000-000000000001/enroll',
      { headers: { Origin: 'http://127.0.0.1:5174' }, data: {} },
    );
    const progress = await learnerPage.request.put(
      'http://127.0.0.1:5174/api/lessons/20000000-0000-4000-8000-000000000101/progress',
      {
        headers: { Origin: 'http://127.0.0.1:5174' },
        data: { positionSeconds: 5, completed: true, expectedUpdatedAt: null },
      },
    );
    expect(progress.status()).toBe(200);
    await learnerPage.goto('/dashboard');
    await expect(
      learnerPage.getByRole('heading', { name: 'Hello, Managed. Let’s grow.' }),
    ).toBeVisible();
    await signIn(page, 'admin@app.com');
    await page.getByRole('link', { name: 'Manage learners', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search learners' }).fill(learnerEmail);
    const learnerRow = page.getByRole('row').filter({ hasText: learnerEmail });
    await expect(learnerRow).toContainText('Enabled');
    await page
      .getByRole('button', { name: `View courses for ${learnerEmail}`, exact: true })
      .click();
    await expect(page.getByRole('region', { name: 'Learner enrolled courses' })).toContainText(
      '17%',
    );
    await page.getByRole('button', { name: `Disable ${learnerEmail}`, exact: true }).click();
    await expect(learnerRow).toContainText('Disabled');
    await learnerPage.reload();
    await expect(learnerPage).toHaveURL('/login');
    await learnerPage.getByLabel('Email address').fill(learnerEmail);
    await learnerPage.getByLabel('Password', { exact: true }).fill(password);
    await learnerPage.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(learnerPage.getByRole('alert')).toContainText('account is disabled');
    await page.getByRole('button', { name: `Enable ${learnerEmail}`, exact: true }).click();
    await expect(learnerRow).toContainText('Enabled');
    await learnerPage.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(learnerPage).toHaveURL('/dashboard');
    await expect(learnerPage.locator('.continue-feature')).toContainText('17% complete');

    await page.getByRole('link', { name: 'Manage users', exact: true }).click();
    await page.getByLabel('Full name', { exact: true }).fill('New Test Administrator');
    await page.getByLabel('Email address', { exact: true }).fill(learnerEmail);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create administrator', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('email already exists');
    await page.getByLabel('Email address', { exact: true }).fill(adminEmail);
    await page.getByRole('button', { name: 'Create administrator', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search users', exact: true }).fill(adminEmail);
    await expect(page.getByRole('row').filter({ hasText: adminEmail })).toContainText(
      'Administrator',
    );
    await expect(page.locator('.profile')).toContainText('Demo Administrator');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Toggle workspace navigation' }).click();
    await expect(page.getByRole('link', { name: 'Manage learners', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Manage learners', exact: true }).click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/visible/);
    await expect(page.getByRole('heading', { name: 'Manage learners', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath('manage-learners-mobile.png') });

    await learnerPage.getByRole('button', { name: 'Log out', exact: true }).click();
    await learnerPage.goto('/login');
    await learnerPage.getByLabel('Email address').fill(adminEmail);
    await learnerPage.getByLabel('Password', { exact: true }).fill(password);
    await learnerPage.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(learnerPage).toHaveURL('/admin');
    await expect(
      learnerPage.getByRole('link', { name: 'Manage users', exact: true }),
    ).toBeVisible();
  } finally {
    await learnerContext.close();
  }
});
