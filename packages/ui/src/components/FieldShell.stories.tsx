import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

function FieldShellExamples() {
  return (
    <div className="flex flex-col gap-4">
      <div className="ds-field-shell flex w-72 items-center rounded-ds-control border px-2 py-0">
        <input
          aria-label="Example filter"
          placeholder="Filter options"
          className="ds-control-focus h-8 w-full min-w-0 bg-transparent text-sm text-ds-text-secondary"
        />
      </div>
      <div className="ds-field-shell flex w-72 items-center rounded-ds-control border px-2 py-0">
        <select
          aria-label="Example choice"
          className="ds-control-focus h-8 w-full min-w-0 cursor-pointer bg-transparent text-sm text-ds-text-secondary"
        >
          <option>All options</option>
          <option>First option</option>
        </select>
      </div>
    </div>
  );
}

const meta = {
  title: 'Patterns/FieldShell',
  parameters: {
    layout: 'padded',
    docs: { description: { component: 'A bordered shell owns the focus border for the text control it contains; the inner control draws no outline of its own. Compose it when a filter row needs a shared border around a native input or select.' } },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <FieldShellExamples /> };

export const Focused: Story = {
  render: () => <FieldShellExamples />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const controls = [
      canvas.getByRole('textbox', { name: 'Example filter' }),
      canvas.getByRole('combobox', { name: 'Example choice' }),
    ];
    for (const control of controls) {
      control.focus();
      await expect(control).toHaveFocus();
      await expect(getComputedStyle(control).outlineStyle).toBe('none');
    }
  },
};
