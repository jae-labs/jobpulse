import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type TagColorTheme =
  | 'accent'
  | 'warning'
  | 'interviewing'
  | 'negative'
  | 'positive'
  | 'neutral'
  | 'status-new';

const THEME_CLASSES: Record<
  TagColorTheme,
  {
    chip: string;
    close: string;
  }
> = {
  accent: {
    chip: 'border-ds-accent/30 bg-ds-accent-subtle text-ds-text-primary hover:border-ds-accent/50',
    close: 'text-ds-accent hover:text-ds-text-primary',
  },
  warning: {
    chip: 'border-ds-warning/30 bg-ds-warning/10 text-ds-warning hover:border-ds-warning/50',
    close: 'text-ds-warning/80 hover:text-ds-text-primary',
  },
  interviewing: {
    chip: 'border-ds-status-interviewing/30 bg-ds-status-interviewing/10 text-ds-status-interviewing hover:border-ds-status-interviewing/50',
    close: 'text-ds-status-interviewing/80 hover:text-ds-text-primary',
  },
  negative: {
    chip: 'border-ds-negative/30 bg-ds-negative/10 text-ds-negative hover:border-ds-negative/50',
    close: 'text-ds-negative/80 hover:text-ds-text-primary',
  },
  positive: {
    chip: 'border-ds-positive/30 bg-ds-positive/10 text-ds-positive hover:border-ds-positive/50',
    close: 'text-ds-positive/80 hover:text-ds-text-primary',
  },
  neutral: {
    chip: 'border-ds-border-strong/60 bg-ds-hover/60 text-ds-text-secondary hover:border-ds-border-strong',
    close: 'text-ds-text-muted hover:text-ds-text-primary',
  },
  'status-new': {
    chip: 'border-ds-status-new/30 bg-ds-status-new/10 text-ds-status-new hover:border-ds-status-new/50',
    close: 'text-ds-status-new/80 hover:text-ds-text-primary',
  },
};

export interface TagChipInputProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  theme?: TagColorTheme;
  addOnBlur?: boolean;
  className?: string;
  inputId?: string;
  ariaLabel?: string;
}

export const TagChipInput: React.FC<TagChipInputProps> = ({
  items,
  onChange,
  placeholder = '+ Add item (press Enter)...',
  theme = 'accent',
  addOnBlur = true,
  className = '',
  inputId,
  ariaLabel,
}) => {
  const { t } = useTranslation();
  const [inputVal, setInputVal] = useState('');
  const colors = THEME_CLASSES[theme] || THEME_CLASSES.accent;

  const handleAdd = () => {
    const trimmed = inputVal.trim();
    if (!trimmed) return;
    if (!items.includes(trimmed)) {
      onChange([...items, trimmed]);
    }
    setInputVal('');
  };

  const handleRemove = (itemToRemove: string) => {
    onChange(items.filter((item) => item !== itemToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Backspace' && !inputVal && items.length > 0) {
      handleRemove(items[items.length - 1]);
    }
  };

  return (
    <div className={`ds-field-shell flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border p-1.5 ${className}`}>
      {items.map((item) => (
        <span
          key={item}
          className={`group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors select-none ${colors.chip}`}
        >
          <span>{item}</span>
          <button
            type="button"
            onClick={() => handleRemove(item)}
            className={`cursor-pointer transition-colors ${colors.close}`}
            title={t('common.removeItem', { item })}
            aria-label={t('common.removeItem', { item })}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={inputId}
        aria-label={ariaLabel}
        type="text"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addOnBlur ? handleAdd : undefined}
        placeholder={placeholder}
        className="ds-control-focus min-w-[160px] flex-1 bg-transparent px-2 py-0.5 text-xs text-ds-text-primary placeholder:text-ds-text-muted focus:outline-none"
      />
    </div>
  );
};
