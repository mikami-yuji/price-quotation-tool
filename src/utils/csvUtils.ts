import { ReadymadeMasterRow } from '../types';

/**
 * Shift-JIS形式の「価格表.csv」を解析して ReadymadeMasterRow[] を返します。
 * @param buffer CSVファイルのバイナリデータ
 * @returns 解析結果の配列
 */
export const parseReadymadeCSV = (buffer: ArrayBuffer): ReadymadeMasterRow[] => {
  const decoder = new TextDecoder('shift-jis');
  const text = decoder.decode(buffer);
  const lines = text.split(/\r?\n/);
  
  const results: ReadymadeMasterRow[] = [];
  
  // ヘッダー行（通常2行目）から「備考_2」列のインデックスを探す
  const headerLine = lines[1] || lines[0] || '';
  const headers = headerLine.split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const remark2Index = headers.findIndex(h => h === '備考_2');
  
  // 1行目と2行目はヘッダーなので、3行目から開始
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 17) continue;
    
    const productCode = cols[1];
    if (!productCode) continue;

    // 「備考_2」から最小数量をパースする
    let minQuantity = 0;
    if (remark2Index !== -1 && cols[remark2Index]) {
      const remark = cols[remark2Index];
      // (500～) や (1000-) などの形式を数値として抽出
      const match = remark.match(/\((\d+)[～~-]/);
      if (match) {
        minQuantity = parseInt(match[1], 10);
      }
    }
    
    // インデックス11〜13: キャンペーン単価 (売, 準D, D)
    // インデックス14〜16: 通常単価 (売, 準D, D)
    const masterRow: ReadymadeMasterRow = {
      productCode,
      minQuantity,
      campaign: {
        uru: parseFloat(cols[11]) || 0,
        junD: parseFloat(cols[12]) || 0,
        d: parseFloat(cols[13]) || 0,
      },
      normal: {
        uru: parseFloat(cols[14]) || 0,
        junD: parseFloat(cols[15]) || 0,
        d: parseFloat(cols[16]) || 0,
      }
    };
    
    results.push(masterRow);
  }
  
  return results;
};
