# three.js (vendored)

Used only by the landing's 3D scene: the WebGL roll intro
(`assets/intro3d/intro.mjs`, and its other games: the wheel,
`assets/intro3d/wheel.mjs`) and the home it flies into - the card table
(`assets/intro3d/table.mjs`), the study (`assets/intro3d/study.mjs`) or the
arcade (`assets/intro3d/arcade.mjs`) - and by the Lounge payouts: Obsidian
Ledger's orrery (`assets/intro3d/orrery.mjs`, also the study's centrepiece)
and Neon Grid's moonrise (`assets/intro3d/moonrise.mjs`, whose moon the arcade
shares), all loaded with a dynamic `import()`.
Everything else in the app stays classic scripts with no dependencies.

- Version: three.js r186 (`three@0.186.1` on npm), MIT licence (`LICENSE`).
- `three.core.js`, `three.module.js`: the package's `build/` files,
  minified with esbuild. The file names are kept so the module's own
  `import ... from "./three.core.js"` still resolves.
- `three.addons.js`: the addons the scene uses - the postprocessing chain
  (EffectComposer, RenderPass, UnrealBloomPass, OutputPass) and the CSS3D
  renderer (CSS3DRenderer, CSS3DObject) that lays the table's cards and
  controls into the scene as page elements - bundled into one file,
  importing three from `./three.module.js`, so no import map is needed.

To update, from a scratch directory:

```sh
npm pack three@<version> && tar xzf three-<version>.tgz
npx esbuild package/build/three.core.js --minify --format=esm --outfile=three.core.js
npx esbuild package/build/three.module.js --minify --format=esm --outfile=three.module.js
cat > addons-entry.js <<'EOF'
export { EffectComposer } from './package/examples/jsm/postprocessing/EffectComposer.js';
export { RenderPass } from './package/examples/jsm/postprocessing/RenderPass.js';
export { UnrealBloomPass } from './package/examples/jsm/postprocessing/UnrealBloomPass.js';
export { OutputPass } from './package/examples/jsm/postprocessing/OutputPass.js';
export { CSS3DRenderer, CSS3DObject } from './package/examples/jsm/renderers/CSS3DRenderer.js';
EOF
npx esbuild addons-entry.js --bundle --format=esm --minify --external:three --outfile=three.addons.js
sed -i 's#from"three"#from"./three.module.js"#g' three.addons.js
```

then copy the three files and `package/LICENSE` here, bump `CACHE_NAME` in
`sw.js`, and play every tier with `?lab`.
