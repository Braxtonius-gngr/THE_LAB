// node bodies-test.cjs <bodyId> <outPrefix>   (repo root served on :8765)
// Opens lab/bodies.html, picks the body, and screenshots: close front + 3/4 with anatomy,
// pose test, motion test, and the Walking / Air Squat / Running clips. Prints page errors.
const { chromium } = require('playwright');
(async () => {
  const [, , id, pre] = process.argv;
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 800 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/lab/bodies.html');
  await p.waitForFunction(() => window.__lab && window.__lab.anat && document.querySelectorAll('#anim option').length > 1, null, { timeout: 180000 });
  await p.selectOption('#pick', id);
  await p.waitForFunction(i => document.getElementById('pick').value === i && !document.getElementById('info').textContent.startsWith('Loading'), id, { timeout: 180000 });
  await p.waitForTimeout(1500);
  const shot = async (n, v) => { await p.evaluate(v => window.__view(...v), v); await p.waitForTimeout(900); await p.screenshot({ path: `${pre}-${n}.png` }); };
  await shot('front', [0, 0.05, 0.75, 0.8]); await shot('q', [0.9, 0.1, 0.9, 0.8]);
  await p.click('#pose'); await shot('pose', [0.4, 0.1, 3.2, 0.95]); await p.click('#pose');
  await p.click('#motion'); await p.waitForTimeout(1300); await shot('motion', [0.6, 0.1, 1.2, 0.82]); await p.click('#motion');
  await p.evaluate(() => window.__view(0.7, 0.1, 4.2, 0.9));
  for (const [i, t, n] of [[1, 900, 'walk'], [7, 700, 'squat'], [0, 600, 'run']]) { await p.selectOption('#anim', String(i)); await p.waitForTimeout(t); await p.screenshot({ path: `${pre}-${n}.png` }); }
  console.log(await p.textContent('#info')); console.log('errors', errs); await b.close();
})();
