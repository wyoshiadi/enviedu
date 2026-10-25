import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';
import { mkdir, readFile, readdir, writeFile, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const cloudflare = process.argv.includes('--cloudflare');
await viteBuild();
const clientRoot = path.join(root, 'build/client'), assets = {};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(filename);
    else { const key = '/' + path.relative(clientRoot, filename).split(path.sep).join('/'); assets[key] = { body: await readFile(filename, 'utf8'), type: types[path.extname(filename)] || 'application/octet-stream' }; }
  }
}
await collect(clientRoot);
const deploymentRoot = path.resolve(root, cloudflare ? 'build/cloudflare' : 'dist');
const deploymentParent = path.resolve(root, cloudflare ? 'build' : '.');
if (path.dirname(deploymentRoot) !== deploymentParent || path.basename(deploymentRoot) !== (cloudflare ? 'cloudflare' : 'dist')) throw new Error('Invalid build output path.');
try { if ((await lstat(deploymentRoot)).isSymbolicLink()) throw new Error('Build output must not be a symbolic link.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await rm(deploymentRoot, { recursive: true, force: true });
await mkdir(path.join(deploymentRoot, 'server'), { recursive: true });
await esbuild({ entryPoints: [path.join(root, cloudflare ? 'worker/cloudflare.ts' : 'worker/index.ts')], outfile: path.join(deploymentRoot, 'server/index.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, plugins: [{ name: 'embedded-site-assets', setup(build) {
  build.onResolve({ filter: /^enviedu:assets$/ }, () => ({ path: 'assets', namespace: 'enviedu' }));
  build.onLoad({ filter: /.*/, namespace: 'enviedu' }, () => ({ contents: 'export default ' + JSON.stringify(assets), loader: 'js' }));
} }] });
if (!cloudflare) {
  const manifest = JSON.parse(await readFile(path.join(root, '.openai/hosting.json'), 'utf8'));
  if (manifest.static) throw new Error('The server build must use a Worker hosting manifest.');
  await mkdir(path.join(root, 'dist/.openai'), { recursive: true });
  await writeFile(path.join(root, 'dist/.openai/hosting.json'), JSON.stringify(manifest, null, 2) + '\n');
}
const worker = await import(pathToFileURL(path.join(deploymentRoot, 'server/index.js')).href);
if (typeof worker.default?.fetch !== 'function') throw new Error('Invalid Worker ESM artifact.');
if (cloudflare && typeof worker.default?.scheduled !== 'function') throw new Error('The Cloudflare Worker must include the scheduled session cleanup handler.');
console.log(`${cloudflare ? 'Standalone Cloudflare' : 'Sites'} Worker ready; frontend assets are embedded in ${path.relative(root, deploymentRoot).split(path.sep).join('/')}/server/index.js.`);
