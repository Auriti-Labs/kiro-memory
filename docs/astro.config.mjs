import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://auriti-labs.github.io',
  base: '/kiro-memory',
  integrations: [
    starlight({
      title: 'Kiro Memory',
      description: 'Persistent cross-session memory for AI coding assistants',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        replacesTitle: false,
      },
      social: {
        github: 'https://github.com/Auriti-Labs/kiro-memory',
      },
      editLink: {
        baseUrl: 'https://github.com/Auriti-Labs/kiro-memory/edit/main/docs/',
      },
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
            { label: 'Configuration', slug: 'getting-started/configuration' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Hooks', slug: 'guides/hooks' },
            { label: 'MCP Server', slug: 'guides/mcp-server' },
            { label: 'SDK', slug: 'guides/sdk' },
            { label: 'Dashboard', slug: 'guides/dashboard' },
            { label: 'Search', slug: 'guides/search' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'REST API', slug: 'reference/api' },
            { label: 'CLI Commands', slug: 'reference/cli' },
            { label: 'Environment Variables', slug: 'reference/environment-variables' },
            { label: 'Database Schema', slug: 'reference/database-schema' },
            { label: 'MCP Tools', slug: 'reference/mcp-tools' },
          ],
        },
        {
          label: 'Integrations',
          items: [
            { label: 'Overview', slug: 'integrations/index' },
            { label: 'Claude Code', slug: 'integrations/claude-code' },
            { label: 'Cursor', slug: 'integrations/cursor' },
            { label: 'Windsurf', slug: 'integrations/windsurf' },
            { label: 'Cline', slug: 'integrations/cline' },
          ],
        },
        {
          label: 'Contributing',
          items: [
            { label: 'Architecture', slug: 'contributing/architecture' },
            { label: 'Development', slug: 'contributing/development' },
            { label: 'Testing', slug: 'contributing/testing' },
          ],
        },
      ],
      customCss: ['./src/styles/custom.css'],
      defaultLocale: 'root',
      locales: {
        root: {
          label: 'English',
          lang: 'en',
        },
      },
    }),
  ],
});
