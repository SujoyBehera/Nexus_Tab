import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'ULTRON',
    description:
      'Autonomous Cybernetic AI Agent: analyze pages, execute directives, and write code live.',
    homepage_url: 'https://github.com/your-username/ultron',
    permissions: [
      'storage',
      'scripting',
      'activeTab',
      'tabs',
      // `sidePanel` is Chromium-only (Chrome, Brave, Edge). Firefox uses sidebar_action.
      ...(browser === 'firefox' ? [] : ['sidePanel']),
    ],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Open ULTRON' },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'ultron@local.dev',
              // 128 = MAIN-world content scripts; 140 = data_collection_permissions.
              strict_min_version: '140.0',
              // Page text you ask about is sent to the AI provider you configure.
              data_collection_permissions: { required: ['websiteContent'] },
            },
          },
        }
      : {
          // sidePanel + openPanelOnActionClick + MAIN-world scripts.
          minimum_chrome_version: '116',
        }),
  }),
});
