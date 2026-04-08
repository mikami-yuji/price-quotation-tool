import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { OrderRecord } from '../types';
import { shortenProductName } from './stringUtils';

/**
 * 見積書（価格改定表）をExcel形式で生成しダウンロードする
 */
export const generateQuoteExcel = async (
  customerName: string,
  orders: OrderRecord[],
  date: string,
  category: string,
  showProductCode: boolean
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('見積書');

  // 列の定義と幅の設定
  const baseCols = [
    { header: '種別', key: 'category', width: 10 },
    { header: '受注No', key: 'orderNumber', width: 15 },
    ...(showProductCode ? [{ header: '商品コード', key: 'productCode', width: 15 }] : []),
    { header: '商品名 / 材質', key: 'productNameMaterial', width: 40 },
    { header: '形状', key: 'shape', width: 10 },
    { header: '受注数', key: 'quantity', width: 10 },
    { header: '印刷コード', key: 'printCode', width: 15 },
    { header: '重量', key: 'weight', width: 8 },
    { header: '色数', key: 'colors', width: 6 },
    { header: '印刷代', key: 'printingCost', width: 12 },
    { header: '現行単価', key: 'currentPrice', width: 12 },
    { header: '新単価', key: 'newPrice', width: 12 },
    { header: '改定率', key: 'rate', width: 10 },
  ];

  // 1. ヘッダーセクション（宛名・日付など）
  // 発行日
  worksheet.getCell('A1').value = `発行日：${date}`;
  worksheet.getCell('A1').alignment = { horizontal: 'right' };
  worksheet.mergeCells(`A1:${String.fromCharCode(64 + baseCols.length)}1`);

  // 宛名
  worksheet.getCell('A3').value = `${customerName} 御中`;
  worksheet.getCell('A3').font = { size: 14, bold: true };
  worksheet.getCell('A3').border = { bottom: { style: 'thin' } };
  worksheet.mergeCells('A3:E3');

  // タイトル
  worksheet.getCell('A5').value = '価格改定のお願い（御見積書）';
  worksheet.getCell('A5').font = { size: 18, bold: true };
  worksheet.getCell('A5').alignment = { horizontal: 'center' };
  worksheet.mergeCells(`A5:${String.fromCharCode(64 + baseCols.length)}5`);

  // 挨拶文
  const greetings = [
    '拝啓 時下益々ご清栄のこととお慶び申し上げます。平素は格別のご高配を賜り、厚く御礼申し上げます。',
    'さて、既にご承知の通り、昨今の世界情勢の影響による原材料費の変動、物流コストの上昇、ならびにエネルギー価格の高騰が続いております。',
    '弊社におきましても、これまでコスト削減に努めてまいりましたが、自社努力のみでは現行価格の維持が困難な状況となりました。',
    'つきましては、誠に心苦しい限りではございますが、下記の通り価格改定をお願いしたく存じます。何卒諸事情をご賢察の上、ご了承賜りますようお願い申し上げます。 敬具'
  ];
  
  greetings.forEach((text, i) => {
    const rowNum = 7 + i;
    worksheet.getCell(`A${rowNum}`).value = text;
    worksheet.mergeCells(`A${rowNum}:${String.fromCharCode(64 + baseCols.length)}${rowNum}`);
  });

  worksheet.getCell('A12').value = '【改定内容一覧】';
  worksheet.getCell('A12').font = { bold: true };

  // 2. データテーブルセクション
  const startRow = 13;
  
  // テーブルヘッダーの描画
  baseCols.forEach((col, i) => {
    const cell = worksheet.getCell(startRow, i + 1);
    cell.value = col.header;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F2F2' }
    };
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    worksheet.getColumn(i + 1).width = col.width;
  });

  // データの流し込み
  orders.forEach((order, rowIndex) => {
    const currentRowNum = startRow + 1 + rowIndex;
    const rowData = [
      order.category,
      order.orderNumber,
      ...(showProductCode ? [order.productCode] : []),
      `${(order.category === 'SP' || order.category === 'シルク' || order.category === '別注' || order.category === 'ポリ別注') 
          ? shortenProductName(order.title || order.productName) 
          : order.productName}\n${order.materialName}`,
      order.shape,
      order.quantity,
      order.printCode,
      order.weight,
      order.totalColorCount,
      order.printingCost || 0,
      order.currentPrice,
      order.newPrice || 0,
      (order.newPrice !== undefined && order.currentPrice > 0)
        ? `${(((order.newPrice - order.currentPrice) / order.currentPrice) * 100).toFixed(1)}%`
        : '-'
    ];

    rowData.forEach((val, colIndex) => {
      const cell = worksheet.getCell(currentRowNum, colIndex + 1);
      cell.value = val;
      cell.alignment = { 
        vertical: 'middle', 
        horizontal: (typeof val === 'number') ? 'right' : 'left',
        wrapText: true 
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      // 数値フォーマットの適用
      if (colIndex >= rowData.length - 4 && colIndex < rowData.length - 1 && typeof val === 'number') {
        cell.numFmt = '#,##0.00';
      }
    });

    // 行の高さを自動調整（改行が含まれるため）
    worksheet.getRow(currentRowNum).height = 30;
  });

  // 3. フッターセクション
  const footerStartRow = startRow + orders.length + 2;
  worksheet.getCell(`A${footerStartRow}`).value = '※ 実施時期：別途ご相談';
  worksheet.getCell(`A${footerStartRow + 1}`).value = '※ ご不明な点がございましたら、営業担当までお問い合わせください。';
  
  worksheet.getCell(`A${footerStartRow + 3}`).value = '株式会社 アサヒパック';
  worksheet.getCell(`A${footerStartRow + 3}`).alignment = { horizontal: 'right' };
  worksheet.mergeCells(`A${footerStartRow + 3}:${String.fromCharCode(64 + baseCols.length)}${footerStartRow + 3}`);

  // ダウンロード実行
  const buffer = await workbook.xlsx.writeBuffer();
  const safeCustomerName = customerName.replace(/[\\/:*?"<>|]/g, '_');
  const fileName = `見積書_${safeCustomerName}_${category}_${date}.xlsx`;
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, fileName);
};
