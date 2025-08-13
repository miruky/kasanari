import { defineConfig } from 'vitest/config';

// GitHub Pages はリポジトリ名のサブパス配信になるため、
// デプロイ時だけ VITE_BASE=/kasanari/ を渡して base を切り替える。
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
