'use client';

import { useState, useRef, ChangeEvent, FocusEvent, KeyboardEvent } from 'react';

type InlineNumericInputProps = {
  value: number;
  onCommit: (value: number) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  decimals?: number;
  suffix?: string;
  rowIndex?: number;
  colKey?: string;
};

/**
 * テーブル内で数値をスムーズに入力するためのコンポーネント
 * 入力中はローカルステートで値を保持し、確定時（Enter/Blur）に親の状態を更新する
 */
export default function InlineNumericInput({
  value,
  onCommit,
  onKeyDown,
  className,
  style,
  placeholder,
  decimals = 2,
  suffix = '',
  rowIndex,
  colKey,
}: InlineNumericInputProps): React.ReactElement {
  // 入力中の文字列を保持
  const [localValue, setLocalValue] = useState<string>(() => {
    if (value === 0) return '';
    return value.toFixed(decimals) + suffix;
  });
  // 編集モードフラグ
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 外部からの値の変更を同期（レンダーフェーズでの同期）
  const [prevValue, setPrevValue] = useState<number>(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!isEditing) {
      if (value === 0) {
        setLocalValue('0' + suffix);
      } else {
        setLocalValue(value.toFixed(decimals) + suffix);
      }
    }
  }

  const handleFocus = (e: FocusEvent<HTMLInputElement>): void => {
    setIsEditing(true);
    // 編集時はサフィックスを除去
    const val = value === 0 ? '' : value.toFixed(decimals);
    setLocalValue(val);
    // 内容を全選択して上書きしやすくする
    setTimeout(() => e.target.select(), 0);
  };

  const handleBlur = (): void => {
    setIsEditing(false);
    // 数値としてパース。空文字や不正な文字列の場合は0として扱う（ユーザー要望：空欄は0）
    const num = parseFloat(localValue);
    const finalValue = isNaN(num) ? 0 : num;
    
    // 表示用にサフィックスを付与
    setLocalValue(finalValue.toFixed(decimals) + suffix);

    // 変更があった場合のみコミット
    if (finalValue !== value) {
      onCommit(finalValue);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value;
    // 数値、小数点、マイナス符号のみ許可
    if (/^-?\d*\.?\d*$/.test(val)) {
      setLocalValue(val);
    }
  };

  const handleKeyDownInternal = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      // Enterキーで入力を確定（フォーカスを外すことでBlurが発生しコミットされる）
      inputRef.current?.blur();
    }
    // 親から渡されたキーイベント（セル移動など）を実行
    onKeyDown?.(e);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
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
