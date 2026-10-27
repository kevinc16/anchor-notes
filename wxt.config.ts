import { execFileSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  zip: {
    includeSources: [
      'assets/**',
      'components/**',
      'entrypoints/**',
      'lib/**',
      'public/**',
      'styles/**',
      'package.json',
      'package-lock.json',
      'wxt.config.ts',
      'tsconfig.json',
      '.nvmrc',
      'LICENSE',
      'README.md',
      'docs/development.md',
      'docs/dependency-maintenance.md',
      'scripts/validate-firefox-build.mjs',
    ],
  },
  hooks: {
    'zip:sources:start': (wxt) => {
      // Directory allowlists alone still include unrelated local files inside source folders.
      const files = execFileSync('git', ['ls-files', '-z', '--', ...wxt.config.zip.includeSources], {
        cwd: wxt.config.zip.sourcesRoot,
        encoding: 'utf8',
      })
        .split('\0')
        .filter((file) => file === '.nvmrc' || (file && !file.split('/').some((part) => part.startsWith('.'))));
      if (!files.includes('package.json') || !files.includes('package-lock.json')) {
        throw new Error('Source packaging requires a Git checkout with tracked build inputs.');
      }
      // WXT interprets these as globs; treat Git filenames as literal paths.
      wxt.config.zip.includeSources = files.map((file) => file.replace(/[\\*?[\]{}()|"]/g, '\\$&'));
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: (env) => ({
    name: 'Anchor Notes',
    version: '0.5.0',
    description: 'Highlight the web, keep durable notes, and remember the important things.',
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Anchor Notes',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
      },
    },
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    commands: {
      'save-highlight': {
        suggested_key: {
          default: 'Alt+Shift+H',
          mac: 'Alt+Shift+H',
        },
        description: 'Highlight the current selection',
      },
      'open-library': {
        suggested_key: {
          default: 'Alt+Shift+L',
          mac: 'Alt+Shift+L',
        },
        description: 'Open the notes library',
      },
    },
    ...(env.browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: '@anchor-notes.kevinc16',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['none'],
                optional: ['browsingActivity', 'websiteContent'],
              },
            },
          },
        }
      : {}),
  }),
});
