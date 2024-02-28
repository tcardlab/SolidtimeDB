import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { join } from 'path';
// import devtools from 'solid-devtools/vite';

export default defineConfig({
  plugins: [
    /* 
    Uncomment the following line to enable solid-devtools.
    For more info see https://github.com/thetarnav/solid-devtools/tree/main/packages/extension#readme
    */
    // devtools(),
    solidPlugin(),
  ],
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: [
      { find: '@', replacement: join(__dirname, '../') },
      { find: '~', replacement: join(__dirname, './src') }
    ],
  }
});
