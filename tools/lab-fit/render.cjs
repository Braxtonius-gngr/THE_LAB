// node render.cjs "<url>" out.png [width height]
// Serve the repo root first:  python3 -m http.server 8765
// url e.g. "http://localhost:8765/tools/lab-fit/views.html?m=/work/shape.glb&flat=1&cy=0.84&cd=1.3"
// views.html params: m (GLB url), flat=1 (plain skin material: geometry only), nonrm=1 (colour only),
// onlyn=1 (normal map only), noskin=1 (skeleton off), cy (camera height m), cd (distance m).
// Renders front / side / back / 3-4 in one strip.
const { chromium } = require('playwright');
(async () => {
  const [, , url, out, W = 1600, H = 700] = process.argv;
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: +W, height: +H } }); p.on('pageerror', e => console.log(e.message));
  await p.goto(url); await p.waitForFunction(() => document.title === 'done', null, { timeout: 180000 });
  await p.screenshot({ path: out }); await b.close();
})();
