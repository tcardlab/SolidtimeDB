import { defineConfig, loadEnv } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { join } from 'path';
import devtools from 'solid-devtools/vite';

function resolve_remote(env: any) {
  let {
    STDB_CLIENT_MODE,
    STDB_LOCAL_ADDRESS, STDB_LOCAL_PORT, 
    STDB_DEV_ADDRESS, STDB_PROD_ADDRESS
  } = env

  let local_addr = `http://${STDB_LOCAL_ADDRESS ?? "127.0.0.1"}:${STDB_LOCAL_PORT ?? 3000}`
  
  switch(STDB_CLIENT_MODE) {
    case 'local': return local_addr
    case 'development': return STDB_DEV_ADDRESS
    case 'production': return STDB_PROD_ADDRESS
    default: return local_addr
  }
}

export let resolve_module_name = (env:any) => {
  let {
    // local, development, production
    STDB_SERVER_MODE,
    STDB_MODULE
  } = env

  if (!STDB_MODULE) {
    // throw new Error ('ERR - Module Name Required: add a "STDB_MODULE" to .env')
    console.warn('WARNING - "STDB_MODULE" missing in .env, defaulting to package name.')
    return name
  }
  
  if (!STDB_SERVER_MODE) {
    //return `${STDB_MODULE}` // should i default to local?
    return `${STDB_MODULE}_${'local'}`
  }

  if (STDB_MODULE && STDB_SERVER_MODE) {
    return `${STDB_MODULE}_${STDB_SERVER_MODE}`
  }
}

export default defineConfig(({mode})=>{
  const env = loadEnv(mode, join(process.cwd(), '../'), '')
  let stdb_addr = resolve_remote(env)

  return {
    define: {
      __STDB_ENV__: JSON.stringify({
        STDB_ADDRESS: stdb_addr,
        STDB_WS: stdb_addr.replace(/^http/, 'ws'),
        STDB_MODULE: resolve_module_name(env) // env.STDB_MODULE
      })
    },
    plugins: [
      /* 
      Uncomment the following line to enable solid-devtools.
      For more info see https://github.com/thetarnav/solid-devtools/tree/main/packages/extension#readme
      */
      devtools(),
      solidPlugin(),
    ],
    server: {
      port: +env.STDB_CLIENT_PORT,
      open: true,
      proxy: {
        '^/database/sql/.*': stdb_addr,
        '/identity': stdb_addr,
        '/identity/*': stdb_addr
      }
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
  }
});
