async page => {
  const base = page.url().split('#')[0];
  const results = [];
  const require = (value, message) => { if (!value) throw new Error(message); };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [1280, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base);
    await page.locator('img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const layout = await page.evaluate(() => ({
      viewport: innerWidth, content: document.documentElement.scrollWidth,
      images: [...document.images].every(image => image.complete && image.naturalWidth > 0),
      scripts: document.scripts.length,
      headings: [...document.querySelectorAll('h1')].map(heading => heading.textContent)
    }));
    require(layout.content <= width, `${width}px horizontal overflow: ${layout.content}`);
    require(layout.images && layout.scripts === 0 && layout.headings.length === 1, `${width}px content failed`);
    require(layout.headings[0].includes('your layout'), 'Heading text joins words across a line break');
    const type = await page.evaluate(() => ({
      code: parseFloat(getComputedStyle(document.querySelector('pre code')).fontSize),
      caption: parseFloat(getComputedStyle(document.querySelector('.caption')).fontSize),
      status: parseFloat(getComputedStyle(document.querySelector('.status')).fontSize)
    }));
    require(type.code >= 14 && type.caption >= 12 && type.status >= 12, `${width}px evidence text is too small`);
    require(await page.locator('[data-alignment-rule]').textContent().then(text => JSON.parse(text).tolerance === 2), 'Rendered rule must be the actual contract excerpt');
    results.push({ width, ...layout, type });
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  require(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '200% text overflows at 320px');
  require(await page.locator('.skip').evaluate(element => element.getBoundingClientRect().bottom <= 0), 'Hidden skip link protrudes at 200% text');
  results.push({ enlargedText: '200% at 320px', overflow: false });
  await page.goto(base);
  await page.keyboard.press('Tab');
  require(await page.locator('.skip').evaluate(element => element === document.activeElement), 'Skip link is not first focus');
  require(await page.locator('.skip').evaluate(element => element.getBoundingClientRect().top >= 0 && getComputedStyle(element).outlineStyle !== 'none'), 'Skip focus is not visible');
  await page.keyboard.press('Enter');
  require(page.url().endsWith('#main'), 'Skip link did not reach main');
  await page.goto(base);
  const focused = [];
  for (let index = 0; index < 7; index++) {
    await page.keyboard.press('Tab');
    focused.push(await page.evaluate(() => ({ text: document.activeElement.textContent.trim(), outline: getComputedStyle(document.activeElement).outlineStyle })));
  }
  require(focused.every(item => item.outline !== 'none'), 'A keyboard focus indicator is missing');
  require(focused.some(item => item.text.includes('Run your first check')), 'Primary action is not keyboard reachable');
  await page.getByRole('link', { name: 'Run your first check' }).press('Enter');
  require(page.url().endsWith('#start'), 'Primary action did not reach first use');
  require(await page.locator('a.image-link').count() === 3, 'Each capture needs a full-size link');
  require(await page.locator('a.image-link').evaluateAll(links => links.every(link => link.getAttribute('aria-label')?.includes('screenshot at full size'))), 'Capture links lack accessible names');
  const disclosure = page.locator('.capture-details:not(.fixture-downloads)');
  require(await disclosure.evaluate(element => !element.open), 'Capture disclosure should start closed');
  await disclosure.locator('summary').press('Enter');
  require(await disclosure.evaluate(element => element.open), 'Keyboard cannot open native disclosure');
  await disclosure.locator('summary').press('Enter');
  require(await disclosure.evaluate(element => !element.open), 'Keyboard cannot close native disclosure');
  await page.locator('a.image-link').first().press('Enter');
  require(page.url().endsWith('/assets/first-use/broken-768.png'), 'Full-size capture link failed');
  await page.locator('img').evaluate(image => image.decode());
  require(await page.locator('img').evaluate(image => image.naturalWidth === 768 && image.naturalHeight === 440), 'Full-size capture dimensions differ');
  const noJS = await page.context().browser().newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
  try {
    const mobile = await noJS.newPage();
    await mobile.goto(base);
    const profile = await mobile.evaluate(() => ({ width: innerWidth, touch: 'ontouchstart' in window,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }));
    require(profile.width === 390 && profile.touch && profile.reducedMotion, 'Mobile input profile was not applied');
    const action = mobile.getByRole('link', { name: 'Run your first check' });
    const box = await action.boundingBox();
    require(box && box.height >= 44 && box.width >= 44, 'Primary touch target is too small');
    await action.tap();
    require(mobile.url().endsWith('#start'), 'Touch navigation failed without JS');
    require(await mobile.getByRole('heading', { name: 'Start with a known outcome.' }).isVisible(), 'First-use content unavailable without JS');
    await mobile.locator('.capture-details:not(.fixture-downloads) summary').tap();
    require(await mobile.locator('.capture-details:not(.fixture-downloads)').evaluate(element => element.open), 'Touch cannot open native disclosure without JS');
    const files = mobile.locator('.fixture-downloads');
    await files.locator('summary').tap();
    require(await files.evaluate(element => element.open), 'Fixture links need a no-JS native disclosure');
    require(await files.getByRole('link', {name: 'Download healthy HTML', exact: true}).getAttribute('download') !== null, 'Fixture download must save the actual file');
    await Promise.all([
      mobile.waitForURL('**/portfolio-alignment-broken.html'),
      files.getByRole('link', {name: 'Open broken page', exact: true}).tap()
    ]);
    require(mobile.url().endsWith('/portfolio-alignment-broken.html'), 'Broken fixture should open directly');
    const stacked = await mobile.evaluate(() => {
      const a = document.querySelector('.copy').getBoundingClientRect();
      const b = document.querySelector('.artwork').getBoundingClientRect();
      return b.top >= a.bottom;
    });
    require(stacked, 'The downloaded mobile fixture must genuinely stack');
    results.push({ noJavaScript: true, touchNavigation: true, fixtureViewing: true, profile, keyboardFocus: focused });
  } finally { await noJS.close(); }
  await page.goto(base);
  const resources = await page.locator('[href], [src]').evaluateAll(elements => [...new Set(elements.flatMap(element => [element.getAttribute('href'), element.getAttribute('src')]).filter(value => value && !value.startsWith('https:') && !value.startsWith('#')))]);
  for (const resource of resources) {
    const response = await page.request.get(base.slice(0, base.lastIndexOf('/') + 1) + resource);
    require(response.ok(), `Local link failed: ${resource} (${response.status()})`);
  }
  await page.locator('img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  return { passed: true, results, localResources: resources.length };
}
