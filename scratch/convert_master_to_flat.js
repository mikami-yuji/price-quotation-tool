const XLSX = require('xlsx');
const path = require('path');

// 材質キーワードの判定ユーティリティ
const getSPRowType = (val) => {
  const v = String(val || '').normalize('NFKC').trim().toLowerCase();
  if (!v) return null;
  // 「売」の判定
  if (v.includes('売') || v.includes('通常') || v.includes('うる') || v.includes('sale')) return '売';
  // 「準」の判定
  if (v.includes('準') || v.includes('jun')) return '準';
  // 純粋な「D」の判定
  if (v.includes('d') || v.includes('ｄ') || v.includes('バラ')) return 'D';
  return null;
};

const inputPath = path.join('D:', 'google_cli', '値上げツール', '●【20260428】セレクトパック価格改定_社内用.xlsx');
const outputPath = path.join('D:', 'google_cli', '値上げツール', 'scratch', 'SP_Master_NoCatalog.xlsx');

try {
  const workbook = XLSX.readFile(inputPath);
  // カタログNo列を削除したヘッダー
  const flatData = [['材質キーワード', '重量(kg)', '数量', '単位', '区分', '1色', '2色', '3色', '4色']];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length === 0) continue;

    // シート名からキーワードを抽出 (例: "11_SPポリポリ" -> "ポリポリ")
    const materialKeyword = sheetName.replace(/^[0-9_]+/, '').replace(/SP/g, '').trim();

    // ヘッダー情報のスキャン
    let headerConfigs = [];
    for (let r = 0; r < Math.min(rows.length, 100); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      
      const config = { weight: [], lot: [], type: [], colors: {} };
      let foundHeader = false;

      row.forEach((cell, c) => {
        const v = String(cell || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
        // 品番は無視するように変更
        if (v.includes('数量') || v.includes('ロット') || v.includes('枚数') || v.includes('本数')) { config.lot.push(c); foundHeader = true; }
        if (v.includes('kg') || v.includes('㎏') || v.includes('重量')) { config.weight.push(c); foundHeader = true; }
        if (v.includes('区分') || v.includes('タイプ')) { config.type.push(c); foundHeader = true; }
        const m = v.match(/([1-8])色/);
        if (m) config.colors[c] = parseInt(m[1], 10);
      });

      if (foundHeader && config.lot.length > 0) {
        // 横並びの表を分解
        config.lot.forEach((lIdx, i) => {
          const subConfig = {
            lot: lIdx,
            weight: config.weight[i] !== undefined ? config.weight[i] : config.weight[0],
            type: config.type[i] !== undefined ? config.type[i] : (config.type[0] || -1),
            colors: {}
          };
          // カラー列の割り当て (lotIdxの近くにあるものを拾う)
          const nextLotIdx = config.lot[i+1] || 999;
          Object.entries(config.colors).forEach(([colIdx, color]) => {
            const idx = parseInt(colIdx, 10);
            if (idx > lIdx && idx < nextLotIdx) subConfig.colors[idx] = color;
          });
          headerConfigs.push({ rowIdx: r, ...subConfig });
        });
        break;
      }
    }

    if (headerConfigs.length === 0) continue;

    const seenSpecs = new Set(); // 重複排除用

    headerConfigs.forEach(config => {
      let currentWeight = 0;
      let currentQty = 0;
      let currentUnit = 'pcs';

      for (let r = config.rowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!Array.isArray(row)) continue;

        // 重量の抽出
        if (config.weight !== -1) {
          const wVal = String(row[config.weight] || '');
          const w = parseFloat(wVal.replace(/[^\d.]/g, ''));
          if (!isNaN(w) && w > 0) currentWeight = w;
        }

        // 数量の抽出
        const qVal = String(row[config.lot] || '');
        const q = parseFloat(qVal.replace(/[^\d.]/g, ''));
        if (!isNaN(q) && q > 0) {
          currentQty = q;
          if (qVal.includes('m') || qVal.includes('ｍ')) currentUnit = 'm';
          else if (qVal.includes('枚')) currentUnit = '枚';
        }

        if (currentQty === 0) continue;

        // 区分の抽出
        let rowType = null;
        if (config.type !== -1) {
          rowType = getSPRowType(row[config.type]);
        }
        if (!rowType) {
          for (let i = 0; i < row.length; i++) {
            rowType = getSPRowType(row[i]);
            if (rowType) break;
          }
        }
        if (!rowType) continue;

        // 単価の抽出
        const prices = { 1: '', 2: '', 3: '', 4: '' };
        let hasPrice = false;
        Object.entries(config.colors).forEach(([cIdx, color]) => {
          const p = parseFloat(String(row[cIdx] || '').replace(/[^\d.]/g, ''));
          if (!isNaN(p) && p > 0) {
            prices[color] = p;
            hasPrice = true;
          }
        });

        if (hasPrice) {
          const specKey = `${materialKeyword}_${currentWeight}_${currentQty}_${currentUnit}_${rowType}`;
          if (!seenSpecs.has(specKey)) {
            flatData.push([
              materialKeyword,
              currentWeight, 
              currentQty,
              currentUnit,
              rowType,
              prices[1],
              prices[2],
              prices[3],
              prices[4]
            ]);
            seenSpecs.add(specKey);
          }
        }
      }
    });
  }

  const newWb = XLSX.utils.book_new();
  const newWs = XLSX.utils.aoa_to_sheet(flatData);
  XLSX.utils.book_append_sheet(newWb, newWs, 'FlatMaster');
  XLSX.writeFile(newWb, outputPath);

  console.log(`Successfully created No-Catalog Master: ${outputPath}`);
} catch (err) {
  console.error('Error during conversion:', err);
}
