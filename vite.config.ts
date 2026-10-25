import { defineConfig } from 'vite';
export default defineConfig({
  build: { outDir: 'build/client', emptyOutDir: true },
  plugins: [{ name: 'enviedu-private-modules', generateBundle(_options, bundle) {
    for (const item of Object.values(bundle)) if (item.type === 'chunk') {
      if (Object.keys(item.modules).some(id => /\/domain\/(scoring|export)\.ts$/.test(id.replaceAll('\\', '/')))) throw new Error('Research exports and scoring keys must remain server-only.');
    }
  } }]
});
