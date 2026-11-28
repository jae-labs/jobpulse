import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import i18n from '../../lib/i18n';
import { CategoryBreakdownChart } from './CategoryBreakdownChart';

describe('CategoryBreakdownChart sector navigation', () => {
  afterEach(async () => { await i18n.changeLanguage('en'); });

  it('exposes all 20 sectors plus Other and Uncategorized as keyboard-accessible targets', () => {
    const onSelect = vi.fn();
    const categories = [
      ...Array.from({ length: 20 }, (_, i) => ({ name: `Synthetic Sector ${i + 1}`, value: 10, avgMatch: 80 })),
      { name: 'Other', value: 5, avgMatch: 60 },
      { name: 'Uncategorized', value: 2, avgMatch: 0 },
    ];
    render(<CategoryBreakdownChart categories={categories} onSelectCategory={onSelect} />);
    expect(screen.getByTitle('Synthetic Sector 20')).toHaveAttribute('type', 'button');
    const other = screen.getByTitle('Other');
    expect(other).toHaveAttribute('type', 'button');
    fireEvent.click(other);
    expect(onSelect).toHaveBeenCalledWith('Other');
    fireEvent.click(screen.getByTitle('Uncategorized'));
    expect(onSelect).toHaveBeenLastCalledWith('Uncategorized');
  });

  it('translates Other without changing its database filter value', async () => {
    await i18n.changeLanguage('pt-BR');
    const onSelect = vi.fn();
    render(<CategoryBreakdownChart categories={[{ name: 'Other', value: 10, avgMatch: 60 }]}
      onSelectCategory={onSelect} />);
    fireEvent.click(screen.getByTitle('Outros'));
    expect(onSelect).toHaveBeenCalledWith('Other');
  });
});
