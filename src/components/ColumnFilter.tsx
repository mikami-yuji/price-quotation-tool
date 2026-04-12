'use client';
import React, { useState, useMemo } from 'react';
import styles from '../app/page.module.css';

type ColumnFilterProps = {
  columnKey: string;
  options: string[];
  selectedValues: string[];
  onFilterChange: (values: string[]) => void;
  title: string;
};

const ColumnFilter: React.FC<ColumnFilterProps> = ({
  options,
  selectedValues,
  onFilterChange,
  title
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOptions = useMemo(() => {
    return options.filter(opt => 
      String(opt).toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm]);

  const handleToggle = (value: string) => {
    const nextSelected = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    onFilterChange(nextSelected);
  };

  const handleSelectAll = () => {
    onFilterChange(options);
  };

  const handleClearAll = () => {
    onFilterChange([]);
  };

  return (
    <div className={styles.filterContainer}>
      <button 
        className={`${styles.filterBtn} ${selectedValues.length > 0 ? styles.filterBtnActive : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={`${title}でフィルター`}
      >
        <span className={styles.filterIcon}>🔍</span>
      </button>

      {isOpen && (
        <>
          <div className={styles.filterOverlay} onClick={() => setIsOpen(false)} />
          <div className={styles.filterDropdown}>
            <div className={styles.filterHeader}>
              <input 
                type="text" 
                placeholder="検索..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.filterSearchInput}
                autoFocus
              />
            </div>
            
            <div className={styles.filterActions}>
              <button onClick={handleSelectAll}>すべて選択</button>
              <button onClick={handleClearAll}>クリア</button>
            </div>

            <div className={styles.filterList}>
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt, i) => (
                  <label key={i} className={styles.filterItem}>
                    <input 
                      type="checkbox" 
                      checked={selectedValues.includes(opt)}
                      onChange={() => handleToggle(opt)}
                    />
                    <span>{opt || '(空白)'}</span>
                  </label>
                ))
              ) : (
                <div className={styles.filterEmpty}>見つかりません</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ColumnFilter;
