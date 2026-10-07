import type { Preview } from '@storybook/react-vite';
import { themes } from 'storybook/theming';
import './preview.css';

const preview: Preview = {
  tags: ['autodocs'],
  decorators: [(Story) => <main aria-label="Component preview"><Story /></main>],
  parameters: {
    layout: 'centered',
    controls: { expanded: true },
    docs: { theme: themes.dark },
    a11y: {
      test: 'error',
      context: 'body',
      options: { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } },
    },
    backgrounds: { disable: true },
  },
};
export default preview;
