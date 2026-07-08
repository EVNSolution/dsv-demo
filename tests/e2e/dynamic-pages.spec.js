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


  test('completed deliveries show completion time', async ({ page }) => {
    await page.goto(`/?completed-time=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    const row = page.locator('#fleetList [data-vehicle="complete12"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText(/완료\s+(오전|오후)\s*\d{1,2}:\d{2}/);
    await row.click();
    await expect(page.locator('#destinationList [data-stop="12"]')).toContainText(/완료\s+(오전|오후)\s*\d{1,2}:\d{2}/);
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

  test('settings exposes customer and order demo shortcuts', async ({ page }) => {
    await page.goto(`/?settings-shortcut=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '설정' }).click();
    const customer = page.getByRole('link', { name: '고객사 Demo로 이동' });
    const order = page.getByRole('link', { name: 'Order 배송조회 Demo로 이동' });
    await expect(customer).toHaveAttribute('href', 'index.html?demo=customer-inquiry');
    await expect(order).toHaveAttribute('href', 'index.html?demo=delivery-inquiry');
    await order.click();
    await expect(page).toHaveURL(/demo=delivery-inquiry/);
    await expect(page.getByRole('heading', { name: 'Clever - 배송 조회 Demo' })).toBeVisible();
  });

  async function openCustomerInquiry(page) {
    await page.goto(`/index.html?demo=customer-inquiry&case=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.dsvDemo && typeof window.dsvDemo.customerSnapshot === 'function');
    await expect(page.getByRole('heading', { name: 'Clever - 고객사 Demo' })).toBeVisible();
  }

  test('customer-inquiry shows customer-wide order list below selected order title', async ({ page }) => {
    await openCustomerInquiry(page);
    const card = page.locator('#customerOrderCard');
    await expect(card.locator('.customer-order-head').first()).toContainText('메디팜코리아 수도권 냉장출고');
    await expect(card.locator('.customer-order-head').first()).not.toContainText('DSV-20260708-1001');
    await expect(card).not.toContainText('주문 목록');
    await expect(card.locator('[data-order-no="DSV-20260708-1001"]')).toBeVisible();
    await expect(card.locator('[data-order-no="DSV-20260708-1002"]')).toBeVisible();
    const snapshot = await page.evaluate(() => window.dsvDemo.customerSnapshot());
    expect(snapshot.mode).toBe('customer-inquiry');
    expect(snapshot.orderNos).toEqual(['DSV-20260708-1001', 'DSV-20260708-1002']);
  });

  test('customer-inquiry defaults to multi-vehicle order detail', async ({ page }) => {
    await openCustomerInquiry(page);
    const card = page.locator('#customerOrderCard');
    await expect(card).toContainText('23바 6303');
    await expect(card).toContainText('33사 7311');
    await expect(card).toContainText('차량 목록');
    await expect(card.locator('.customer-route-group.active')).toContainText('23바 6303');
    await expect(card.locator('.customer-route-group').first()).not.toContainText('장지역메디컬센터');
    await expect(card.locator('.customer-destination-row')).toHaveCount(3);
    await expect(card.locator('.customer-destination-row.active')).toContainText('장지역메디컬센터');
    const snapshot = await page.evaluate(() => window.dsvDemo.customerSnapshot());
    expect(snapshot.orderNo).toBe('DSV-20260708-1001');
    expect(snapshot.selectedCustomerVehicleId).toBe('to10');
    expect(snapshot.vehicleIds.sort()).toEqual(['proof11', 'to10']);
    expect(snapshot.sourceCounts.vehicles).toBe(2);
    expect(snapshot.sourceCounts.destinations).toBe(5);
    expect(snapshot.vehicleStopCounts).toEqual({ to10: 3, proof11: 2 });
    await expect.poll(() => page.evaluate(() => window.dsvDemo.customerSnapshot().sourceCounts.routes), { timeout: 15_000 }).toBe(2);
  });

  test('customer-inquiry switches vehicle before showing that vehicle destinations', async ({ page }) => {
    await openCustomerInquiry(page);
    const card = page.locator('#customerOrderCard');
    await card.locator('[data-customer-route="proof11"]').click();
    await expect(card.locator('.customer-route-group.active')).toContainText('33사 7311');
    await expect(card.locator('.customer-destination-row')).toHaveCount(2);
    await expect(card.locator('.customer-destination-row.active')).toContainText('경복궁의학센터');
    await expect(card.locator('.customer-destination-row').first()).toContainText('1');
    await expect(card).toContainText('응급 백신');
    await expect(card).not.toContainText('항암 주사제');
    const snapshot = await page.evaluate(() => window.dsvDemo.customerSnapshot());
    expect(snapshot.selectedCustomerVehicleId).toBe('proof11');
    expect(snapshot.visibleDestinationLabels).toEqual(['1', '2']);
  });

  test('customer-inquiry panel uses list rows inside viewport height', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await openCustomerInquiry(page);
    const card = page.locator('#customerOrderCard');
    await expect(card.locator('.customer-destination-row')).toHaveCount(3);
    await expect(card.locator('.customer-route-group')).toHaveCount(2);
    const metrics = await card.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { height: rect.height, overflowY: style.overflowY, viewport: innerHeight };
    });
    expect(metrics.height).toBeLessThanOrEqual(metrics.viewport - 32);
    expect(metrics.overflowY).toBe('auto');
  });

  test('customer-inquiry switches selected order detail', async ({ page }) => {
    await openCustomerInquiry(page);
    const card = page.locator('#customerOrderCard');
    await card.locator('[data-order-no="DSV-20260708-1002"]').click();
    await expect(card).toContainText('혈액 검체');
    await expect(card).toContainText('광교중앙메디컬센터');
    await expect(card).not.toContainText('응급 백신');
    const snapshot = await page.evaluate(() => window.dsvDemo.customerSnapshot());
    expect(snapshot.orderNo).toBe('DSV-20260708-1002');
    expect(snapshot.vehicleIds).toEqual(['delay07']);
    expect(snapshot.destinationLabels).toEqual(['1', '2', '3']);
    expect(snapshot.visibleDestinationLabels).toEqual(['1', '2', '3']);
    expect(snapshot.vehicleStopCounts).toEqual({ delay07: 3 });
    await expect.poll(() => page.evaluate(() => window.dsvDemo.customerSnapshot().sourceCounts.routes), { timeout: 15_000 }).toBe(1);
  });

  test('customer-inquiry order click fits the selected order on map', async ({ page }) => {
    await openCustomerInquiry(page);
    await page.waitForFunction(() => window.dsvMap && typeof window.dsvMap.fitBounds === 'function');
    await page.evaluate(() => {
      const original = window.dsvMap.fitBounds.bind(window.dsvMap);
      window.__lastCustomerFitBoundsOptions = null;
      window.dsvMap.fitBounds = (bounds, options) => {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        window.__lastCustomerFitBoundsOptions = { ...options, bounds: { west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat } };
        return original(bounds, { ...options, duration: 0 });
      };
    });
    const beforeLat = await page.evaluate(() => window.dsvMap.getCenter().lat);
    await page.locator('#customerOrderCard [data-order-no="DSV-20260708-1002"]').click();
    await page.waitForFunction(() => window.dsvMap.getCenter().lat < 37.38);
    const afterLat = await page.evaluate(() => window.dsvMap.getCenter().lat);
    const padding = await page.evaluate(() => {
      const card = document.querySelector('#customerOrderCard').getBoundingClientRect();
      const map = window.dsvMap.getContainer().getBoundingClientRect();
      return {
        actual: window.__lastCustomerFitBoundsOptions,
        requiredRight: Math.ceil(map.right - card.left + 24)
      };
    });
    expect(afterLat).toBeLessThan(beforeLat - 0.03);
    expect(padding.actual.padding.right).toBeGreaterThanOrEqual(padding.requiredRight - 1);
    expect(padding.actual.maxZoom).toBeLessThanOrEqual(13.8);
    expect(padding.actual.bounds.east - padding.actual.bounds.west).toBeGreaterThan(0.055);
  });

  test('customer-inquiry never renders other customer cargo', async ({ page }) => {
    await openCustomerInquiry(page);
    await expect(page.locator('#customerOrderCard')).not.toContainText('타 고객 개인정보 검체');
    await expect(page.locator('#customerOrderCard')).not.toContainText('99박스');
  });

  test('customer-inquiry destination labels restart by vehicle', async ({ page }) => {
    await openCustomerInquiry(page);
    const snapshot = await page.evaluate(() => window.dsvDemo.customerSnapshot());
    expect(snapshot.destinationLabels).toEqual(['1', '2', '3', '1', '2']);
    expect(snapshot.visibleDestinationLabels).toEqual(['1', '2', '3']);
    expect(snapshot.sourceCounts.adminStops).toBe(0);
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
    await expect(card.locator('.customer-row-meta').first()).toContainText(/도착 예정\s+(오전|오후)\s*\d{1,2}:\d{2}/);
    await expect(card.locator('.customer-row-meta').first()).not.toContainText(/23바 6303|서울 강남구|·/);
    await expect(card).toContainText('임상시험 검체');
    await expect(card).toContainText('냉장 항생제');
    await expect(card).toContainText('온도기록계 동봉');
    await expect(card).toContainText('검체 운송 튜브');
    await expect(card.locator('.customer-status-item').first()).toContainText(/남은 시간/);
    await expect(card.locator('#customerRemainingText')).toContainText(/도착|대기/);
    await expect(card.locator('.customer-status-item').nth(1)).toContainText(/도착 예정/);
    await expect(card.locator('.customer-status-item').nth(2)).toContainText(/정차·하차 예상/);
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
    expect(snapshot.remainingText).toMatch(/도착|대기/);
  });

  test('customer route is visible by default without vehicle click', async ({ page }) => {
    await openCustomer(page);
    await expect.poll(() => page.evaluate(() => window.dsvDemo.customerSnapshot().customerRouteVisible)).toBe(true);
    await expect(page.locator('#customerOrderCard')).toContainText('배송 경로 표시 중');
    await expect(page.locator('#customerOrderCard')).not.toContainText('차량 클릭 시 경로 표시');
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
