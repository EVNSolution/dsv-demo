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

test.describe('fleet ordering', () => {
  test('scheduled loading vehicles sit above indefinite loading holds', async ({ page }) => {
    await page.goto(`/?fleet-sort=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    const rows = page.locator('#fleetList [data-vehicle]');
    await expect(rows.first()).toBeVisible();

    const order = await rows.evaluateAll((nodes) => nodes.map((node) => ({
      id: node.dataset.vehicle,
      text: node.innerText.replace(/\s+/g, ' ')
    })));
    const ids = order.map((row) => row.id);
    const scheduledLoadingIndex = ids.indexOf('load05');
    const departNowIndex = ids.indexOf('depart01');
    const indefiniteLoadingIndexes = ['load01', 'load02', 'load03', 'load04'].map((id) => ids.indexOf(id));

    expect(scheduledLoadingIndex).toBeGreaterThan(-1);
    expect(departNowIndex).toBeGreaterThan(-1);
    expect(indefiniteLoadingIndexes.every((index) => index > -1)).toBeTruthy();
    expect(departNowIndex).toBeLessThan(scheduledLoadingIndex);
    expect(Math.max(departNowIndex, scheduledLoadingIndex)).toBeLessThan(Math.min(...indefiniteLoadingIndexes));
    expect(order[scheduledLoadingIndex].text).toContain('15바 5605');
  });

  test('destination list click spotlights vehicle and route without tracking', async ({ page }) => {
    await page.goto(`/?destination-spotlight=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.dsvDemo && window.dsvMap);
    await page.locator('#fleetList [data-vehicle="depart01"]').click();
    await expect.poll(() => page.evaluate(() => window.dsvDemo.selection().trackingVehicleId)).toBe('depart01');

    await page.locator('#destinationList [data-stop="2"]').click();
    await expect.poll(() => page.evaluate(() => window.dsvDemo.selection())).toMatchObject({
      selectedVehicleId: 'depart01',
      spotlightVehicleId: 'depart01',
      trackingVehicleId: '',
      selectedStopNo: 2
    });
    await expect(page.locator('#floatingDriverCard')).toBeVisible();
    await expect(page.locator('#fleetList [data-vehicle="depart01"]')).toHaveClass(/active/);
  });
});

test.describe('map debug helpers', () => {
  test('expose zoom through dsvMap and dsvDemo instead of window.map', async ({ page }) => {
    await page.goto(`/?zoom-helper=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.dsvMap && typeof window.dsvMap.getZoom === 'function');

    const zoom = await page.evaluate(() => ({ raw: window.dsvMap.getZoom(), rounded: window.dsvDemo.zoom() }));
    expect(typeof zoom.raw).toBe('number');
    expect(typeof zoom.rounded).toBe('number');
    expect(Math.abs(zoom.raw - zoom.rounded)).toBeLessThan(0.01);
  });


  test('hides destination stop layers below zoom 9.5', async ({ page }) => {
    await page.goto(`/?destination-minzoom=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.dsvMap && window.dsvMap.getLayer('stops') && window.dsvMap.getLayer('stop-points') && window.dsvMap.getLayer('stop-point-labels'));

    const minzoomByLayer = await page.evaluate(() => {
      const layers = window.dsvMap.getStyle().layers;
      return Object.fromEntries(['stops', 'stop-points', 'stop-point-labels'].map((id) => [
        id,
        layers.find((layer) => layer.id === id)?.minzoom
      ]));
    });

    expect(minzoomByLayer).toEqual({
      stops: 9.5,
      'stop-points': 9.5,
      'stop-point-labels': 9.5
    });
  });
});

test.describe('customer delivery inquiry demo', () => {
  async function openCustomer(page) {
    await page.goto(`/index.html?demo=delivery-inquiry&case=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.dsvDemo && typeof window.dsvDemo.customerSnapshot === 'function');
    await expect(page.getByRole('heading', { name: 'Clever - 배송 조회 Demo' })).toBeVisible();
  }

  test('settings exposes exact customer demo shortcut', async ({ page }) => {
    await page.goto(`/?settings-shortcut=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '설정' }).click();
    const link = page.getByRole('link', { name: '배송조회 Demo로 이동' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'index.html?demo=delivery-inquiry');
    await link.click();
    await expect(page).toHaveURL(/demo=delivery-inquiry/);
    await expect(page.getByRole('heading', { name: 'Clever - 배송 조회 Demo' })).toBeVisible();
  });

  test('customer page has no admin search or admin chrome', async ({ page }) => {
    await openCustomer(page);
    await expect(page.getByRole('button', { name: '2D' })).toBeVisible();
    await expect(page.getByRole('button', { name: '3D' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Simulation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
    await expect(page.locator('#speedLevel')).toBeVisible();

    await expect(page.getByPlaceholder(/주문|운송장/)).toHaveCount(0);
    await expect(page.getByText(/샘플 주문 선택|차량 리스트|배송지 리스트|온도 변화 그래프/)).toHaveCount(0);
    await expect(page.locator('.left-tabs')).toBeHidden();
    await expect(page.locator('.side')).toBeHidden();
    await expect(page.locator('#notificationIsland')).toBeHidden();
  });

  test('customer card shows exact fixture and medical cargo only', async ({ page }) => {
    await openCustomer(page);
    const card = page.locator('#customerOrderCard');
    await expect(card).toBeVisible();
    await expect(card).toContainText('DSV-20260707-0042');
    await expect(card).toContainText('삼성서울병원 약제팀');
    await expect(card).toContainText('삼성서울병원');
    await expect(card).toContainText('서울 강남구 일원로 81');
    await expect(card).toContainText('임상시험 검체');
    await expect(card).toContainText('냉장 항생제');
    await expect(card).toContainText('온도기록계 동봉');
    await expect(card).toContainText('검체 운송 튜브');
    await expect(card.locator('.customer-status-item').first()).toContainText(/도착 예정/);
    await expect(card.locator('.customer-status-item').nth(1)).toContainText(/정차·하차 예상/);
  });

  test('customer projection exposes one vehicle, one destination, and no admin stops', async ({ page }) => {
    await openCustomer(page);
    const snapshot = await page.evaluate(() => window.dsvDemo.customerSnapshot());
    expect(snapshot).toMatchObject({
      mode: 'delivery-inquiry',
      urlMode: 'demo=delivery-inquiry',
      orderNo: 'DSV-20260707-0042',
      vehicleIds: ['to10'],
      destination: { stopNo: 12, name: '삼성서울병원' },
      adminChromeVisible: false
    });
    expect(snapshot.sourceCounts.vehicles).toBe(1);
    expect(snapshot.sourceCounts.destinations).toBe(1);
    expect(snapshot.sourceCounts.adminStops).toBe(0);
    expect(snapshot.sourceCounts.vehicles).not.toBe(13);
  });

  test('vehicle target opens customer route state without admin panels', async ({ page }) => {
    await openCustomer(page);
    await page.locator('[data-customer-route]').click();
    await expect.poll(() => page.evaluate(() => window.dsvDemo.customerSnapshot().customerRouteVisible)).toBe(true);
    await expect(page.locator('#customerOrderCard')).toContainText('배송 경로 표시 중');
    await expect(page.locator('#floatingDriverCard')).toBeHidden();
    await expect(page.locator('.side')).toBeHidden();
    const snapshot = await page.evaluate(() => window.dsvDemo.customerSnapshot());
    expect(snapshot.vehicleIds).toEqual(['to10']);
    expect(snapshot.sourceCounts.destinations).toBe(1);
    expect(snapshot.sourceCounts.adminStops).toBe(0);
  });

  test('simulation keeps customer source counts scoped', async ({ page }) => {
    await openCustomer(page);
    await page.getByRole('button', { name: 'Start Simulation' }).click();
    await expect(page.getByRole('button', { name: 'Running' })).toBeVisible();
    await page.waitForTimeout(1200);
    const snapshot = await page.evaluate(() => window.dsvDemo.customerSnapshot());
    expect(snapshot.vehicleIds).toEqual(['to10']);
    expect(snapshot.sourceCounts.vehicles).toBe(1);
    expect(snapshot.sourceCounts.destinations).toBe(1);
    expect(snapshot.sourceCounts.adminStops).toBe(0);
  });
});
