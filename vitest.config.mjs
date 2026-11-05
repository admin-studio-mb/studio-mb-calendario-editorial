// ============================================================================
//  vitest.config.mjs
// ----------------------------------------------------------------------------
//  Configuración de tests. Usamos happy-dom como environment para componentes
//  que toquen DOM (DatePicker, Calendar, etc.) y jsdom-free para lógica pura.
// ============================================================================

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['src/**/*.{test,spec}.{js,jsx,mjs}'],
    exclude: ['node_modules/**', 'dist/**', '.astro/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/lib/**',
        'src/stores/**',
      ],
      exclude: ['**/*.test.*'],
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
