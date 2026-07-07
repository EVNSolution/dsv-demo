const { test, expect } = require('@playwright/test');

const pageTargets = [
  { tab: 'couriers', pageClass: 'couriers-page', grid: '.courier-grid', minPanels: 2 },
  { tab: 'work', pageClass: 'work-page', grid: '.work-three-grid', minPanels: 3 },
  { tab: 'issue', pageClass: 'records-page', grid: '.page-grid', minPanels: 3 },
  { tab: 'settings', pageClass: 'settings-page', grid: '.page-grid', minPanels: 2 }
];

async function openTab(page, target, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`/?dynamic-pages=${Date.now()}-${target.tab}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: new RegExp(`^${target.tab === 'issue' ? '기록' : target.tab === 'couriers' ? '배송원' : target.tab === 'work' ? '업무' : '설정'}$`) }).click();
  await page.locator(`#pageContent.${target.pageClass} ${target.grid}`).waitFor({ state: 'visible' });
  await page.waitForTimeout(120);
}

async function layoutSnapshot(page, target) {
  return page.evaluate((target) => {
    const rectOf = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        height: Math.round(r.height),
        scrollHeight: Math.round(el.scrollHeight),
        clientHeight: Math.round(el.clientHeight),
        overflow: cs.overflow,
        overflowY: cs.overflowY,
        gridTemplateColumns: cs.gridTemplateColumns
      };
    };
    const panels = [...document.querySelectorAll(`${target.grid} > .page-panel, ${target.grid} > .work-column`)].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        height: Math.round(r.height),
        text: el.innerText.slice(0, 80).replace(/\s+/g, ' ')
      };
    });
    const headers = [...document.querySelectorAll('.page-panel, .work-column')].map((panel) => {
      const head = panel.querySelector(':scope > .tab-line:first-child, :scope > .courier-detail-head:first-child, :scope > .work-live-head:first-child');
      if (!head) return null;
      const cs = getComputedStyle(head);
      return { text: head.textContent.trim().replace(/\s+/g, ' ').slice(0, 80), bg: cs.backgroundImage, color: cs.backgroundColor };
    }).filter(Boolean);
    return {
      className: document.querySelector('#pageContent')?.className,
      page: rectOf('#pageContent'),
      grid: rectOf(target.grid),
      panels,
      headers,
      visibleText: document.querySelector('#pageContent')?.innerText.slice(0, 240) || ''
    };
  }, target);
}

test.describe('dynamic page cards', () => {
  for (const target of pageTargets) {
    test(`${target.tab} page expands cards on large viewport`, async ({ page }) => {
      await openTab(page, target, { width: 1920, height: 1080 });
      const shot = await layoutSnapshot(page, target);

      expect(shot.className).toContain('dynamic-page');
      expect(shot.className).toContain(target.pageClass);
      expect(shot.visibleText).not.toContain('dynamic-page');
      expect(shot.panels.length).toBeGreaterThanOrEqual(target.minPanels);
      expect(shot.grid.height).toBeGreaterThan(620);
      expect(Math.abs(shot.grid.bottom - (shot.page.bottom - 28))).toBeLessThanOrEqual(36);
      expect(shot.panels.every((panel) => panel.height > 300)).toBeTruthy();
      expect(shot.headers.length).toBeGreaterThanOrEqual(target.minPanels === 3 ? 3 : 2);
      expect(shot.headers.every((head) => head.bg.includes('gradient') || head.color !== 'rgba(0, 0, 0, 0)')).toBeTruthy();
    });

    test(`${target.tab} page stacks safely on narrow viewport`, async ({ page }) => {
      await openTab(page, target, { width: 1080, height: 900 });
      const shot = await layoutSnapshot(page, target);

      expect(shot.page.overflow === 'auto' || shot.page.overflowY === 'auto').toBeTruthy();
      expect(shot.panels.length).toBeGreaterThanOrEqual(target.minPanels);
      expect(shot.panels[0].top).toBeLessThanOrEqual(shot.panels[shot.panels.length - 1].top);
    });
  }
});
