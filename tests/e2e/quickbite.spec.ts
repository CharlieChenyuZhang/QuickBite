import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const demoEmail = 'hello@quickbite.demo'
const demoPassword = 'quickbite123'

async function signIn(page: Page, destination = '/', email = demoEmail) {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`)
  await page.getByLabel('Email or username').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === destination)
}

async function addGreenGoddess(page: Page) {
  await page.goto('/restaurants/1')
  await page.getByRole('button', { name: 'Add The Green Goddess to cart', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Your cart, 1 items', exact: true })).toBeVisible()
}

async function expectNoOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport)
}

test('discovery supports search, category filters, and browser navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Green & Grain', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pizza', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pizzeria Uno', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Green & Grain', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'All cuisines', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Green & Grain', exact: true })).toBeVisible()

  await page.getByLabel('Search restaurants or dishes').fill('pizzeria')
  await page.getByRole('button', { name: 'Submit search' }).click()
  await expect(page).toHaveURL(/q=pizzeria/)
  await expect(page.getByRole('heading', { name: 'Pizzeria Uno', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Green & Grain', exact: true })).toHaveCount(0)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Green & Grain', exact: true })).toBeVisible()
  await expectNoOverflow(page)
})

test('a guest can sign in and return to the menu before ordering', async ({ page }) => {
  await page.goto('/restaurants/1')
  await page.getByRole('button', { name: 'Add The Green Goddess to cart', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await page.getByLabel('Email or username').fill(demoEmail)
  await page.getByLabel('Password', { exact: true }).fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/restaurants\/1$/)
  await expect(page.getByRole('heading', { name: 'Green & Grain', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Add The Green Goddess to cart', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Your cart, 1 items', exact: true })).toBeVisible()
})

test('cart and authentication survive refresh and checkout clears the cart', async ({ page }) => {
  await signIn(page, '/restaurants/1')
  await addGreenGoddess(page)
  await page.getByRole('button', { name: 'Add The Green Goddess to cart', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Your cart, 2 items', exact: true })).toBeVisible()
  await page.goto('/cart')
  await expect(page.getByText('The Green Goddess', { exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Your cart, 2 items', exact: true })).toBeVisible()
  await expect(page.getByText('$29.00', { exact: true }).first()).toBeVisible()
  await expectNoOverflow(page)
  await page.getByRole('link', { name: /Checkout|Proceed to checkout/ }).click()
  await expect(page).toHaveURL(/\/checkout$/)
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await expect(page).toHaveURL(/\/order-confirmation$/)
  await expect(page.getByRole('heading', { name: 'Order confirmed!', exact: true })).toBeVisible()
  await expect(page.getByText('$29.00', { exact: true }).first()).toBeVisible()
  await page.goto('/cart')
  await expect(
    page.getByRole('heading', { name: 'A little empty. A lot of possibilities.', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Your cart, 0 items', exact: true })).toBeVisible()
})

test('empty cart makes the next browsing action clear', async ({ page }) => {
  await signIn(page, '/cart')
  await expect(
    page.getByRole('heading', { name: 'A little empty. A lot of possibilities.', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toHaveCount(0)
  await expectNoOverflow(page)
})

test('saved restaurants persist across reloads and can be removed', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Save Green & Grain', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Unsave Green & Grain', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/saved')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Green & Grain', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pizzeria Uno', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Unsave Green & Grain', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Green & Grain', exact: true })).toHaveCount(0)
  await expectNoOverflow(page)
})

test('signup rejects mismatched passwords before creating an account', async ({ page }) => {
  await page.goto('/signup')
  await page.getByLabel('First name', { exact: true }).fill('Alex')
  await page.getByLabel('Last name', { exact: true }).fill('Lee')
  await page.getByLabel('Email', { exact: true }).fill(demoEmail)
  await page.getByLabel('Password', { exact: true }).fill(demoPassword)
  await page.getByLabel('Confirm password', { exact: true }).fill('different-password')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByText(/passwords.*match/i)).toBeVisible()
  await page.getByLabel('Confirm password', { exact: true }).fill(demoPassword)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
  await expectNoOverflow(page)
})

for (const action of ['Log out', 'Switch account']) {
  test(`${action} ends the session and keeps each account's cart private`, async ({ page }) => {
    await signIn(page, '/restaurants/1')
    await addGreenGoddess(page)
    await page.getByRole('link', { name: 'Your cart, 1 items', exact: true }).click()
    await expect(page).toHaveURL(/\/cart$/)
    await page.getByRole('link', { name: 'Checkout', exact: true }).click()
    await expect(page).toHaveURL(/\/checkout$/)
    await page.getByRole('button', { name: 'My account', exact: true }).click()
    await page.getByRole('button', { name: action, exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'My account', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Your cart, 0 items', exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/login\?redirect=%2Fcart$/)
    await expect(page.getByText('The Green Goddess', { exact: true })).toHaveCount(0)
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fcheckout$/)

    await signIn(page, '/cart', 'another@quickbite.demo')
    await expect(
      page.getByRole('heading', { name: 'A little empty. A lot of possibilities.', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('The Green Goddess', { exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('link', { name: 'Your cart, 0 items', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'My account', exact: true }).click()
    await page.getByRole('button', { name: 'Switch account', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await signIn(page, '/cart')
    await expect(page.getByText('The Green Goddess', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Your cart, 1 items', exact: true })).toBeVisible()
  })
}

test('browser history cannot reveal a previous order confirmation after logout', async ({
  page,
}) => {
  await signIn(page, '/restaurants/1')
  await addGreenGoddess(page)
  await page.goto('/checkout')
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Order confirmed!', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Find your next favorite', exact: true }).click()
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/login\?redirect=%2Forder-confirmation$/)
  await expect(page.getByRole('heading', { name: 'Order confirmed!', exact: true })).toHaveCount(0)
  await expect(page.getByText('The Green Goddess', { exact: true })).toHaveCount(0)
})

test('account dialog is accessible and restores keyboard focus when closed', async ({ page }) => {
  await signIn(page)
  const accountButton = page.getByRole('button', { name: 'My account', exact: true })
  await accountButton.click()
  await expect(page.getByRole('dialog', { name: 'Your account', exact: true })).toBeVisible()
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(
    result.violations.map(({ id, nodes }) => ({
      rule: id,
      elements: nodes.map((node) => ({ selector: node.target, issue: node.failureSummary })),
    })),
  ).toEqual([])
  await page.keyboard.press('Tab')
  expect(
    await page.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement)),
  ).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(accountButton).toBeFocused()
})

for (const route of ['/', '/login', '/restaurants/1', '/cart']) {
  test(`accessible content and responsive layout on ${route}`, async ({ page }, testInfo) => {
    if (route === '/cart') {
      await signIn(page)
      await addGreenGoddess(page)
    }
    await page.goto(route)
    await expect(page.locator('main h1')).toBeVisible()
    // Scan the settled page so loading placeholders cannot conceal violations.
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0)
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    if (result.violations.length) {
      await testInfo.attach('accessibility-violations', {
        body: JSON.stringify(result.violations, null, 2),
        contentType: 'application/json',
      })
    }
    expect(
      result.violations.map(({ id, nodes }) => ({
        rule: id,
        elements: nodes.map((node) => ({ selector: node.target, issue: node.failureSummary })),
      })),
    ).toEqual([])
    await expectNoOverflow(page)
  })
}
