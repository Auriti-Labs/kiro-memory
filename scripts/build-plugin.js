/**
 * Kiro Memory build configuration
 *
 * Usa lo shim bun:sqlite → better-sqlite3 per compatibilità Node.js puro.
 */

import * as esbuild from 'esbuild';
import { join } from 'path';
import { existsSync, mkdirSync, copyFileSync } from 'fs';

const ROOT_DIR = process.cwd();
const SRC_DIR = join(ROOT_DIR, 'src');
const PLUGIN_DIR = join(ROOT_DIR, 'plugin');
const DIST_DIR = join(PLUGIN_DIR, 'dist');

// Plugin esbuild: sostituisce 'bun:sqlite' con lo shim better-sqlite3
const bunSqliteShimPlugin = {
  name: 'bun-sqlite-shim',
  setup(build) {
    build.onResolve({ filter: /^bun:sqlite$/ }, () => ({
      path: join(SRC_DIR, 'shims', 'bun-sqlite.ts'),
    }));
  }
};

// Banner per abilitare require() in contesto ESM (necessario per moduli CJS nativi come better-sqlite3)
const esmRequireBanner = {
  js: `import { createRequire } from 'module';const require = createRequire(import.meta.url);`
};

// Opzioni comuni per tutti i build Node.js
const nodeCommon = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  banner: esmRequireBanner,
  plugins: [bunSqliteShimPlugin],
  // CJS nativi e optional deps, caricati a runtime
  external: ['better-sqlite3', 'fastembed', '@huggingface/transformers', 'onnxruntime-node', '@anush008/tokenizers']
};

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

async function build() {
  console.log('Building Kiro Memory...\n');

  ensureDir(DIST_DIR);

  // Build CLI (banner con shebang + createRequire)
  console.log('Building CLI...');
  await esbuild.build({
    ...nodeCommon,
    entryPoints: [join(SRC_DIR, 'cli', 'contextkit.ts')],
    outfile: join(DIST_DIR, 'cli', 'contextkit.js'),
    banner: { js: `#!/usr/bin/env node\n${esmRequireBanner.js}` }
  });

  // Build SDK
  console.log('Building SDK...');
  await esbuild.build({
    ...nodeCommon,
    entryPoints: [join(SRC_DIR, 'sdk', 'index.ts')],
    outfile: join(DIST_DIR, 'sdk', 'index.js')
  });

  // Build worker service
  console.log('Building worker service...');
  await esbuild.build({
    ...nodeCommon,
    entryPoints: [join(SRC_DIR, 'services', 'worker-service.ts')],
    outfile: join(DIST_DIR, 'worker-service.js'),
    external: ['better-sqlite3', 'express', 'cors', 'fastembed', '@huggingface/transformers', 'onnxruntime-node', '@anush008/tokenizers']
  });

  // Build hook Kiro-compatibili (4 script eseguibili)
  console.log('Building Kiro hooks...');
  const hookEntryPoints = ['agentSpawn', 'userPromptSubmit', 'postToolUse', 'stop'];
  for (const hook of hookEntryPoints) {
    await esbuild.build({
      ...nodeCommon,
      entryPoints: [join(SRC_DIR, 'hooks', `${hook}.ts`)],
      outfile: join(DIST_DIR, 'hooks', `${hook}.js`)
    });
  }

  // Build hook legacy (kiro-hooks.ts per retrocompatibilità)
  console.log('Building legacy hooks...');
  await esbuild.build({
    ...nodeCommon,
    entryPoints: [join(SRC_DIR, 'hooks', 'kiro-hooks.ts')],
    outfile: join(DIST_DIR, 'hooks', 'kiro-hooks.js')
  });

  // Build MCP server
  console.log('Building MCP server...');
  await esbuild.build({
    ...nodeCommon,
    entryPoints: [join(SRC_DIR, 'servers', 'mcp-server.ts')],
    outfile: join(DIST_DIR, 'servers', 'mcp-server.js'),
    external: ['better-sqlite3', '@modelcontextprotocol/sdk']
  });

  // Build SQLite services (singoli file)
  console.log('Building SQLite services...');
  await esbuild.build({
    ...nodeCommon,
    entryPoints: [
      join(SRC_DIR, 'services', 'sqlite', 'index.ts'),
      join(SRC_DIR, 'services', 'sqlite', 'Database.ts'),
      join(SRC_DIR, 'services', 'sqlite', 'Sessions.ts'),
      join(SRC_DIR, 'services', 'sqlite', 'Observations.ts'),
      join(SRC_DIR, 'services', 'sqlite', 'Summaries.ts'),
      join(SRC_DIR, 'services', 'sqlite', 'Prompts.ts'),
      join(SRC_DIR, 'services', 'sqlite', 'Search.ts')
    ],
    outdir: join(DIST_DIR, 'services', 'sqlite')
  });

  // Build search services
  console.log('Building search services...');
  await esbuild.build({
    ...nodeCommon,
    entryPoints: [
      join(SRC_DIR, 'services', 'search', 'index.ts'),
      join(SRC_DIR, 'services', 'search', 'ChromaManager.ts'),
      join(SRC_DIR, 'services', 'search', 'HybridSearch.ts'),
      join(SRC_DIR, 'services', 'search', 'EmbeddingService.ts'),
      join(SRC_DIR, 'services', 'search', 'VectorSearch.ts'),
      join(SRC_DIR, 'services', 'search', 'ScoringEngine.ts')
    ],
    outdir: join(DIST_DIR, 'services', 'search'),
    external: ['better-sqlite3', 'chromadb', 'fastembed', '@huggingface/transformers', 'onnxruntime-node', '@anush008/tokenizers']
  });

  // Build shared
  console.log('Building shared...');
  await esbuild.build({
    ...nodeCommon,
    entryPoints: [join(SRC_DIR, 'shared', 'paths.ts')],
    outdir: join(DIST_DIR, 'shared')
  });

  // Build utils
  console.log('Building utils...');
  await esbuild.build({
    ...nodeCommon,
    entryPoints: [join(SRC_DIR, 'utils', 'logger.ts')],
    outdir: join(DIST_DIR, 'utils')
  });

  // Build types
  console.log('Building types...');
  await esbuild.build({
    ...nodeCommon,
    entryPoints: [join(SRC_DIR, 'types', 'worker-types.ts')],
    outdir: join(DIST_DIR, 'types')
  });

  // Build main index
  console.log('Building main index...');
  await esbuild.build({
    ...nodeCommon,
    entryPoints: [join(SRC_DIR, 'index.ts')],
    outfile: join(DIST_DIR, 'index.js'),
    external: ['better-sqlite3', 'express', 'cors', 'chromadb', 'fastembed', '@huggingface/transformers', 'onnxruntime-node', '@anush008/tokenizers']
  });

  // Copy viewer HTML
  console.log('Copying viewer HTML...');
  copyFileSync(
    join(SRC_DIR, 'ui', 'viewer.html'),
    join(DIST_DIR, 'viewer.html')
  );

  // Build viewer (React - browser, no shim necessario)
  console.log('Building viewer UI...');
  await esbuild.build({
    entryPoints: [join(SRC_DIR, 'ui', 'viewer', 'index.tsx')],
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
    outfile: join(DIST_DIR, 'viewer.js'),
    external: [],
    loader: { '.tsx': 'tsx', '.ts': 'ts' }
  });

  console.log('\n✅ Build complete!');
  console.log(`Output: ${DIST_DIR}`);
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
