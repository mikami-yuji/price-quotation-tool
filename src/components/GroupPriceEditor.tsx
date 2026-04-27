'use client';

import React from 'react';
import styles from '../app/page.module.css';
import InlineNumericInput from './InlineNumericInput';
import { ManualGroupSetting } from '../types';

type EditorGroup = {
  colors: number;
  key: string;
  printCode?: string;
  currentPrice: number;
  currentSalesGroup: number;
  currentPrintingCost: number;
  currentPrintingSalesGroup: number;
};

type GroupPriceEditorProps = {
  activeTab: string;
  editorGroups: { [material: string]: { [weight: string]: EditorGroup[] } };
  manualSettings: ManualGroupSetting;
  updateManualField: (key: string, field: 'price' | 'salesGroup' | 'printingPrice' | 'printingSalesGroup', value: number) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  preventArrowKeys: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

export default function GroupPriceEditor({
  activeTab,
  editorGroups,
  manualSettings,
  updateManualField,
  isExpanded,
  onToggleExpand,
  preventArrowKeys,
}: GroupPriceEditorProps): React.ReactElement | null {
  if (Object.keys(editorGroups).length === 0) return null;

  const title = activeTab === 'sp' ? 'SP' : activeTab === 'readymade' ? '既製品' : activeTab === 'sticker' ? 'シール' : '別注';
  const labelText = activeTab === 'readymade' ? '重量' : '重量・色数';

  return (
    <div className={`${styles.glassPanel} ${styles.groupPriceEditor} ${!isExpanded ? styles.collapsed : ''}`}>
      <header className={styles.editorHeader} onClick={onToggleExpand}>
        <div className={styles.editorTitle}>
          <span className={styles.editorIcon}>🛠</span>
          <h3>{title}グループ単価設定</h3>
          <span className={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
        </div>
        <p className={styles.controlLabel}>材質・{labelText}が同じ商品をまとめて単価設定できます。</p>
      </header>
      
      {isExpanded && (
        <div className={styles.editorContent}>
          {Object.entries(editorGroups).map(([material, weights]) => (
            <div key={material} className={styles.materialSection}>
              <h4 className={styles.materialHeader}>{material || '(材質未定義)'}</h4>
              {Object.entries(weights).map(([weight, groups]) => (
                <div key={weight} className={styles.weightGroup}>
                  <h5 className={styles.weightHeader}>{weight.trim() === '㎏' ? '(重量未定義)' : weight}</h5>
                  <div className={styles.groupGrid}>
                    {groups.map((group) => (
                      <div key={group.key} className={styles.groupInputRow}>
                        <div className={styles.groupInfo}>
                          <div className={styles.groupTopInfo}>
                            {activeTab !== 'readymade' && <span className={styles.groupColors}>{group.colors}色</span>}
                            {group.printCode && <span className={styles.printCodeLabel}>{group.printCode}</span>}
                          </div>
                        </div>
                        <div className={styles.groupInputs}>
                          <div className={styles.inputWrapper}>
                            <span className={styles.inputLabel}>単価</span>
                            <InlineNumericInput 
                              value={manualSettings[group.key]?.price || 0} 
                              onCommit={(val) => updateManualField(group.key, 'price', val)} 
                              onKeyDown={preventArrowKeys} 
                              className={styles.manualInput} 
                              decimals={2} 
                            />
                            <div className={styles.groupPriceDetail}>現行: ¥{group.currentPrice.toFixed(2)}</div>
                          </div>
                          <div className={styles.inputWrapper}>
                            <span className={styles.inputLabel}>営G</span>
                            <InlineNumericInput 
                              value={manualSettings[group.key]?.salesGroup || 0} 
                              onCommit={(val) => updateManualField(group.key, 'salesGroup', val)} 
                              onKeyDown={preventArrowKeys} 
                              className={styles.manualInput} 
                              decimals={2} 
                            />
                            <div className={styles.groupPriceDetail}>現行: ¥{group.currentSalesGroup.toFixed(2)}</div>
                          </div>
                          {activeTab === 'sp' && (
                            <>
                              <div className={styles.inputWrapper}>
                                <span className={styles.inputLabel}>印刷代</span>
                                <InlineNumericInput 
                                  value={manualSettings[group.key]?.printingPrice ?? group.currentPrintingCost ?? 0} 
                                  onCommit={(val) => updateManualField(group.key, 'printingPrice', val)} 
                                  onKeyDown={preventArrowKeys} 
                                  className={styles.manualInput} 
                                  decimals={2} 
                                />
                                <div className={styles.groupPriceDetail}>現行: ¥{(group.currentPrintingCost || 0).toFixed(2)}</div>
                              </div>
                              <div className={styles.inputWrapper}>
                                <span className={styles.inputLabel}>印刷営G</span>
                                <InlineNumericInput 
                                  value={manualSettings[group.key]?.printingSalesGroup ?? group.currentPrintingSalesGroup ?? 0} 
                                  onCommit={(val) => updateManualField(group.key, 'printingSalesGroup', val)} 
                                  onKeyDown={preventArrowKeys} 
                                  className={styles.manualInput} 
                                  decimals={2} 
                                />
                                <div className={styles.groupPriceDetail}>現行: ¥{(group.currentPrintingSalesGroup || 0).toFixed(2)}</div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
