/** @type {import('stylelint').Config} */
export default {
  extends: [
    'stylelint-config-recommended',
    'stylelint-config-tailwindcss',
  ],
  ignoreFiles: [
    '**/node_modules/**',
    '.output/**',
    '.wxt/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ],
};
