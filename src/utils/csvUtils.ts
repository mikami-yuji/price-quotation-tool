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
  
  // 1行目と2行目はヘッダーなので、3行目から開始
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // カンマ区切り（引用符で囲まれている場合も考慮が必要だが、今回のサンプルを見る限りシンプル）
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    
    if (cols.length < 17) continue;
    
    const productCode = cols[1];
    if (!productCode) continue;
    
    // インデックス11〜13: キャンペーン単価 (売, 準D, D)
    // インデックス14〜16: 通常単価 (売, 準D, D)
    const masterRow: ReadymadeMasterRow = {
      productCode,
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
