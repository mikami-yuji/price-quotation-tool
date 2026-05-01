'use client';

import { useState, useRef, ChangeEvent, FocusEvent, KeyboardEvent } from 'react';

type InlineTextInputProps = {
  value: string;
  onCommit: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  rowIndex?: number;
  colKey?: string;
};

/**
 * テーブル内でテキストをスムーズに入力するためのコンポーネント
 */
export default function InlineTextInput({
  value,
  onCommit,
  onKeyDown,
  className,
  style,
  placeholder,
  rowIndex,
  colKey,
}: InlineTextInputProps): React.ReactElement {
  const [localValue, setLocalValue] = useState<string>(value);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 外部からの値の変更を同期
  if (value !== localValue && !isEditing) {
    setLocalValue(value);
  }

  const handleFocus = (e: FocusEvent<HTMLInputElement>): void => {
    setIsEditing(true);
    setTimeout(() => e.target.select(), 0);
  };

  const handleBlur = (): void => {
    setIsEditing(false);
    if (localValue !== value) {
      onCommit(localValue);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setLocalValue(e.target.value);
  };

  const handleKeyDownInternal = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
    onKeyDown?.(e);
  };

  return (
    <input
      ref={inputRef}
      id={rowIndex !== undefined && colKey ? `text-input-${rowIndex}-${colKey}` : undefined}
      name={rowIndex !== undefined && colKey ? `text-input-${rowIndex}-${colKey}` : undefined}
      type="text"
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDownInternal}
      className={className}
      style={style}
      placeholder={placeholder}
      data-row-index={rowIndex}
      data-col-key={colKey}
      autoComplete="off"
    />
  );
}
