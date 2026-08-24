import { chromium } from 'playwright-core';
const ctx = await chromium.launchPersistentContext('/tmp/pause-profile', {
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],
  viewport: { width: 960, height: 540 },
});
const page = ctx.pages()[0] ?? await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:8080/', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => Boolean(window.__crowMathSmoke), undefined, { timeout: 45000 });
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('crow_')) localStorage.removeItem(k); localStorage.setItem('crow_locale','en'); });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.__crowMathSmoke), undefined, { timeout: 45000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__crowMathSmoke?.startLevel('level_01'));
await page.waitForFunction(() => Boolean(window.__crowGame?.scene?.isActive?.('GameScene')), undefined, { timeout: 30000 });
await page.waitForTimeout(2500);

const dump = async (label) => {
  const out = await page.evaluate(() => {
    const g = window.__crowGame; const rows = [];
    const walk = (list) => { for (const o of list) {
      if (o.type === 'Text' && o.text) { const b = o.getBounds();
        rows.push({ t: o.text.slice(0,22), l: Math.round(b.left), r: Math.round(b.right), y: Math.round(b.centerY) }); }
      if (o.list) walk(o.list); } };
    const per = {};
    for (const s of g.scene.scenes) if (s.sys.settings.active) { rows.length = 0; walk(s.children.list); per[s.sys.settings.key] = [...rows]; }
    return per;
  });
  console.log(`--- ${label}`);
  for (const [k, rows] of Object.entries(out)) {
    if (!rows.length) continue;
    console.log(`  [${k}]`);
    for (const r of rows) console.log(`     ${String(r.t).padEnd(24)} x ${String(r.l).padStart(4)}..${String(r.r).padStart(4)}  cy ${r.y}`);
  }
};
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
await dump('pause open, EN');
await page.locator('canvas').screenshot({ path: '/tmp/pause-en.png' });
console.log(errors.length ? 'ERRORS: ' + errors.slice(0,3).join(' | ') : 'no page/console errors');
await ctx.close();
