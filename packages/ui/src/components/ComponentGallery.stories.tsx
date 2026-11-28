import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Button } from './Button';
import { Card } from './Card';
import { Field } from './Field';
import { TextField } from './TextField';
import { Select } from './Select';
import { Textarea } from './Textarea';
import { Pill } from './Pill';

function SettingsForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  return <Card className="w-full max-w-md space-y-5 p-6">
    <h1 className="text-xl font-medium">Contact settings</h1>
    <form noValidate className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
      setError(valid ? '' : 'Enter a valid email address.');
      setSaved(valid);
    }}>
      <Field label="Email address" description="Messages use this address." error={error} required>
        {(props) => <TextField {...props} type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setSaved(false); }} />}
      </Field>
      <Button type="submit">Save settings</Button>
      {saved && <p role="status" className="text-sm text-ds-positive">Settings saved.</p>}
    </form>
  </Card>;
}

const meta = {
  title: 'Patterns/ComponentGallery',
  parameters: { layout: 'padded', docs: { description: { component: 'Composed examples verify control states, readable content, validation and narrow layouts. Validation and copy belong to consumers.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Controls: Story = { render: () => <div className="max-w-3xl space-y-6">
  <h1 className="text-xl font-medium">Controls and states</h1>
  <section aria-label="Actions" className="flex flex-wrap gap-3">
    <Button>Continue</Button><Button variant="secondary">Cancel</Button><Button variant="ghost">Details</Button><Button variant="danger">Delete</Button><Button disabled>Unavailable</Button>
  </section>
  <div className="grid gap-4 sm:grid-cols-2">
    <Field label="Email address" description="Use an address you can access.">{(props) => <TextField {...props} placeholder="name@example.com" />}</Field>
    <Field label="Invalid address" error="Enter a valid email address.">{(props) => <TextField {...props} defaultValue="invalid" />}</Field>
    <Field label="Disabled field">{(props) => <TextField {...props} disabled value="Unavailable" />}</Field>
    <Field label="Choice">{(props) => <Select {...props}><option>First option</option><option>Second option</option></Select>}</Field>
    <Field label="Notes">{(props) => <Textarea {...props} rows={3} placeholder="Supporting information" />}</Field>
  </div>
  <section aria-label="Filter states" className="flex flex-wrap gap-3">
    <Pill label="All" active /><Pill label="Selected" tone="positive" active /><Pill label="Warning" tone="warning" /><Pill label="Unavailable" disabled />
  </section>
</div> };
export const Form: Story = { render: () => <SettingsForm /> };
export const Validation: Story = { ...Form, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Save settings' }));
  const control = canvas.getByRole('textbox', { name: 'Email address' });
  await expect(control).toHaveAttribute('aria-invalid', 'true');
  await expect(control).toHaveAccessibleDescription('Messages use this address. Enter a valid email address.');
  await userEvent.type(control, 'reader@example.com');
  await userEvent.click(canvas.getByRole('button', { name: 'Save settings' }));
  await expect(canvas.getByRole('status')).toHaveTextContent('Settings saved.');
  await expect(control).not.toHaveAttribute('aria-invalid');
} };
