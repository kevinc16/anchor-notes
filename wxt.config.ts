import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Anchor Notes',
    version: '0.3.0',
    description: 'Highlight the web, keep durable notes, and remember the important things.',
    permissions: ['storage', 'tabs', 'activeTab', 'contextMenus'],
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
  },
});
