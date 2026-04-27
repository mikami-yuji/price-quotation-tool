'use client';

import React from 'react';
import styles from '../app/page.module.css';

type SummaryDashboardProps = {
  itemCount: number;
  currentTotal: number;
  newTotal: number;
  revenueIncrease: number;
  avgRevisionRate: number;
};

export default function SummaryDashboard({
  itemCount,
  currentTotal,
  newTotal,
  revenueIncrease,
  avgRevisionRate,
}: SummaryDashboardProps): React.ReactElement {
  return (
    <div className={styles.summaryDashboard}>
      <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
        <span className={styles.summaryLabel}>表示アイテム数</span>
        <span className={styles.summaryValue}>{itemCount} 件</span>
      </div>
      <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
        <span className={styles.summaryLabel}>現行 売上合計</span>
        <span className={styles.summaryValue}>¥{currentTotal.toLocaleString()}</span>
      </div>
      <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
        <span className={styles.summaryLabel}>改定後 予想売上</span>
        <span className={styles.summaryValue}>¥{newTotal.toLocaleString()}</span>
        <span className={`${styles.summaryTrend} ${styles.trendUp}`}>
          +{revenueIncrease.toLocaleString()} 円増加
        </span>
      </div>
      <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
        <span className={styles.summaryLabel}>平均改定率</span>
        <span className={`${styles.summaryValue} ${styles.priceUp}`}>
          {avgRevisionRate.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
