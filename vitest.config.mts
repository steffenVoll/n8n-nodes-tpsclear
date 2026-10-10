import { defineConfig } from 'vitest/config';

export default defineConfig({
	// n8n-workflow ships sourcemaps that point at sources it does not publish;
	// vite warns once per file and the warnings drown the test summary.
	logLevel: 'error',
	test: {
		include: ['test/**/*.test.ts'],
	},
});
