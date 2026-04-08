'use client';

import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';
import { OrderRecord } from '../types';
import { shortenProductName } from '../utils/stringUtils';

// Register Japanese font (Noto Sans JP) from Google Fonts
Font.register({
  family: 'Noto Sans JP',
  fonts: [
    { src: '/fonts/NotoSansJP-Regular.otf', fontWeight: 400 },
    { src: '/fonts/NotoSansJP-Bold.otf', fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Noto Sans JP',
    color: '#333',
    fontSize: 10,
  },
  header: {
    marginBottom: 20,
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  customerInfo: {
    marginBottom: 20,
  },
  customerName: {
    fontSize: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 2,
    marginBottom: 4,
  },
  date: {
    textAlign: 'right',
    marginBottom: 10,
  },
  greeting: {
    marginBottom: 20,
    lineHeight: 1.5,
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#bfbfbf',
    marginBottom: 20,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableColHeader: {
    backgroundColor: '#f2f2f2',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#bfbfbf',
    padding: 5,
    fontWeight: 'bold',
  },
  tableCol: {
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#bfbfbf',
    padding: 5,
  },
  colSmall: { width: '7%' },
  colCode: { width: '8%' },
  colName: { width: '16%' },
  colPrintCode: { width: '7%' },
  colShape: { width: '6%' },
  colQty: { width: '6%' },
  colWeight: { width: '6%' },
  colExtra: { width: '4%' },
  colPrice: { width: '10%' },
  footer: {
    marginTop: 30,
    textAlign: 'left',
  },
});

type QuotePDFProps = {
  customerName: string;
  orders: OrderRecord[];
  date: string;
};

export const QuotePDF: React.FC<QuotePDFProps> = ({ customerName, orders, date }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.date}>発行日：{date}</Text>
      
      <View style={styles.customerInfo}>
        <Text style={styles.customerName}>{customerName} 御中</Text>
      </View>

      <Text style={styles.title}>価格改定のお願い（御見積書）</Text>
      
      <View style={styles.greeting}>
        <Text>拝啓 時下益々ご清栄のこととお慶び申し上げます。平素は格別のご高配を賜り、厚く御礼申し上げます。</Text>
        <Text>さて、既にご承知の通り、昨今の世界情勢の影響による原材料費の変動、物流コストの上昇、ならびにエネルギー価格の高騰が続いております。</Text>
        <Text>弊社におきましても、これまでコスト削減に努めてまいりましたが、自社努力のみでは現行価格の維持が困難な状況となりました。</Text>
        <Text>つきましては、誠に心苦しい限りではございますが、下記の通り価格改定をお願いしたく存じます。何卒諸事情をご賢察の上、ご了承賜りますようお願い申し上げます。 敬具</Text>
      </View>

      <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>【改定内容一覧】</Text>
      
      <View style={styles.table}>
        {/* Header */}
        <View style={[styles.tableRow, { backgroundColor: '#f2f2f2' }]}>
          <Text style={[styles.tableCol, styles.colSmall, { fontWeight: 'bold' }]}>種別</Text>
          <Text style={[styles.tableCol, styles.colCode, { fontWeight: 'bold' }]}>コード</Text>
          <Text style={[styles.tableCol, styles.colName, { fontWeight: 'bold' }]}>商品名 / 材質</Text>
          <Text style={[styles.tableCol, styles.colShape, { fontWeight: 'bold' }]}>形状</Text>
          <Text style={[styles.tableCol, styles.colQty, { fontWeight: 'bold' }]}>受注数</Text>
          <Text style={[styles.tableCol, styles.colPrintCode, { fontWeight: 'bold' }]}>印刷コード</Text>
          <Text style={[styles.tableCol, styles.colWeight, { fontWeight: 'bold' }]}>重量</Text>
          <Text style={[styles.tableCol, styles.colExtra, { fontWeight: 'bold' }]}>色数</Text>
          <Text style={[styles.tableCol, styles.colPrice, { fontWeight: 'bold' }]}>印刷代</Text>
          <Text style={[styles.tableCol, styles.colPrice, { fontWeight: 'bold' }]}>現行単価</Text>
          <Text style={[styles.tableCol, styles.colPrice, { fontWeight: 'bold' }]}>新単価</Text>
          <Text style={[styles.tableCol, styles.colPrice, { fontWeight: 'bold' }]}>改定率</Text>
        </View>
        
        {/* Rows */}
        {orders.map((order, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.tableCol, styles.colSmall]}>{order.category}</Text>
            <Text style={[styles.tableCol, styles.colCode]}>{order.productCode}</Text>
            <Text style={[styles.tableCol, styles.colName]}>
              {(order.category === 'SP' || order.category === 'シルク' || order.category === '別注' || order.category === 'ポリ別注') 
                ? shortenProductName(order.title || order.productName) 
                : order.productName}
              {"\n"}{order.materialName}
            </Text>
            <Text style={[styles.tableCol, styles.colShape]}>{order.shape}</Text>
            <Text style={[styles.tableCol, styles.colQty]}>{order.quantity}</Text>
            <Text style={[styles.tableCol, styles.colPrintCode]}>{order.printCode}</Text>
            <Text style={[styles.tableCol, styles.colWeight]}>{order.weight}</Text>
            <Text style={[styles.tableCol, styles.colExtra]}>{order.totalColorCount}</Text>
            <Text style={[styles.tableCol, styles.colPrice]}>{(order.printingCost || 0).toFixed(2)}</Text>
            <Text style={[styles.tableCol, styles.colPrice]}>{order.currentPrice.toFixed(2)}</Text>
            <Text style={[styles.tableCol, styles.colPrice]}>{order.newPrice?.toFixed(2)}</Text>
            <Text style={[styles.tableCol, styles.colPrice]}>
              {order.newPrice !== undefined && order.currentPrice > 0 
                ? `${(((order.newPrice - order.currentPrice) / order.currentPrice) * 100).toFixed(1)}%` 
                : '-'}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={{ marginBottom: 5 }}>※ 実施時期：別途ご相談</Text>
        <Text>※ ご不明な点がございましたら、営業担当までお問い合わせください。</Text>
      </View>
      
      <Text style={{ marginTop: 40, textAlign: 'right' }}>株式会社 アサヒパック</Text>
    </Page>
  </Document>
);
