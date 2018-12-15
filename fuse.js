const {
  FuseBox,
  WebIndexPlugin,
  QuantumPlugin,
  EnvPlugin,
  CopyPlugin,
  JSONPlugin,
} = require('fuse-box');
const express = require('express');
const { spawn } = require('child_process');

const production = process.env.NODE_ENV === 'dev' ? false : true;

const getConfig = (target, name) => {
  return {
    homeDir: 'src/',
    cache: !production,
    target,
    output: `build/$name.js`,
    tsConfig: './tsconfig.json',
    useTypescriptCompiler: true,
    plugins: [
      EnvPlugin({ NODE_ENV: production ? 'production' : 'development' }),
      production &&
        QuantumPlugin({
          bakeApiIntoBundle: name,
          treeshake: true,
          removeExportsInterop: false,
          uglify: {
            es6: true,
          },
        }),
    ],
    alias: {
      '@': '~/shared/',
      '@app': '~/renderer/app/',
      '@history': '~/renderer/history/',
      '@bookmarks': '~/renderer/bookmarks/',
      '@about': '~/renderer/about/',
      '@newtab': '~/renderer/newtab/',
      '~': '~/',
    },
  };
};

const getRendererConfig = (target, name) => {
  const cfg = Object.assign({}, getConfig(target, name), {
    sourceMaps: !production,
  });

  return cfg;
};

const getWebIndexPlugin = name => {
  return WebIndexPlugin({
    template: `static/pages/${name}.html`,
    path: production ? '.' : '/',
    target: `${name}.html`,
    bundles: [name],
  });
};

const getCopyPlugin = () => {
  return CopyPlugin({
    files: ['*.woff2', '*.png', '*.svg'],
    dest: 'assets',
    resolve: production ? './assets' : '/assets',
  });
};

const mainProcess = () => {
  const fuse = FuseBox.init(getConfig('server', 'main'));

  const app = fuse.bundle('main').instructions('> [main/index.ts]');

  if (!production) {
    app.watch();
  }

  fuse.run();
};

const renderer = () => {
  const cfg = getRendererConfig('electron', 'app');

  cfg.plugins.push(getWebIndexPlugin('app'));
  cfg.plugins.push(JSONPlugin());
  cfg.plugins.push(getCopyPlugin());

  const fuse = FuseBox.init(cfg);

  if (!production) {
    fuse.dev({ httpServer: true });
  }

  const app = fuse.bundle('app').instructions('> [renderer/app/index.tsx]');

  if (!production) {
    app.hmr().watch();

    return fuse.run().then(() => {
      const child = spawn('npm', ['start'], {
        shell: true,
        stdio: 'inherit',
      });
    });
  }

  fuse.run();
};

const applets = () => {
  const cfg = getRendererConfig('browser@es6');

  cfg.plugins.push(getWebIndexPlugin('newtab'));
  cfg.plugins.push(JSONPlugin());
  cfg.plugins.push(getCopyPlugin());

  const fuse = FuseBox.init(cfg);

  if (!production) {
    fuse.dev({ httpServer: true, port: 8080 });
  }

  const newtab = fuse
    .bundle('newtab')
    .instructions('> renderer/newtab/index.tsx');

  if (!production) {
    newtab.hmr().watch();
  }

  fuse.run();
};

const preloads = () => {
  const fuse = FuseBox.init(getRendererConfig('electron', 'webview-preload'));

  const webviewPreload = fuse
    .bundle('webview-preload')
    .instructions('> preloads/webview-preload.ts');

  const backgroundPagePreload = fuse
    .bundle('background-page-preload')
    .instructions('> preloads/background-page-preload.ts');

  if (!production) {
    webviewPreload.watch();
    backgroundPagePreload.watch();
    return;
  }

  fuse.run();
};

renderer();
preloads();
mainProcess();
applets();
