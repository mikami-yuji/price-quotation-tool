const XLSX = require('xlsx');

function parseSPMasterFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  
  for (const sheetName of workbook.SheetNames) {
    if (sheetName !== '01_SPZIP') continue;
    
    console.log(`Analyzing sheet: ${sheetName}`);
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    const colorLabelMap = {};
    for (let r = 0; r < Math.min(rows.length, 500); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      row.forEach((cell, c) => {
        const v = String(cell || '').replace(/\s+/g, '').replace(/[０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
        const m = v.match(/([1-8])色/);
        if (m) colorLabelMap[c] = parseInt(m[1]);
        else if (/^[1-8]$/.test(v)) colorLabelMap[c] = parseInt(v); 
      });
    }

    const catalogColumnSet = new Set();
    for (let scanR = 0; scanR < Math.min(rows.length, 30); scanR++) {
      const scanRow = rows[scanR];
      if (!Array.isArray(scanRow)) continue;
      scanRow.forEach((cell, c) => {
        const s = String(cell || '').replace(/\s+/g, '');
        if (s.includes('カタログ') || s.includes('ｶﾀﾛｸﾞ') || s.includes('品番') || s.includes('№')) {
          for (let dc = -1; dc <= 1; dc++) catalogColumnSet.add(c + dc);
        }
      });
    }

    const colState = {};
    const spMaster = [];
    
    const getSPRowType = (val) => {
      const v = String(val || '').trim();
      if (v.length > 8) return null; 
      if (v.includes('売') || v.includes('通常') || v.includes('うる')) return 'uru';
      if (v.includes('準') || v.includes('JUN')) return 'junD';
      if (v.includes('Ｄ') || v.includes('D') || v.includes('バラ')) return 'd';
      return null;
    };

    for (let r = 0; r < 20; r++) { // Just test first 20 rows
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const rowHeaderInfo = [];

      for (let c = 0; c < row.length; c++) {
        const raw = String(row[c] || '').trim();
        const isHeaderLabel = (s) => /ロット|数量|最小|以上|以下|GP|利益|原価|理想|コスト|サイズ|形状|材質|品名|商品|コード|No|重量|kg|色|枚|m|~|～/.test(s);
        const type = getSPRowType(raw);
        if (type) continue;

        const val = raw.replace(/\s+/g, '').replace(/[０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0)).replace(/[ｋＫ㎏]/g, 'k');
        if (!val) continue;

        const cats = [];
        const isNearCatalogColumn = catalogColumnSet.size === 0 || [...catalogColumnSet].some(cc => Math.abs(c - cc) <= 2);
        if (isNearCatalogColumn) {
          val.split(/[\n\s,、/]+/).forEach(x => {
            const clean = x.replace(/[△▲・No.]/g, '').trim();
            if (/^[\d-]{3,10}$/.test(clean) && clean.length >= 3) {
              cats.push(clean.replace(/-/g, ''));
            }
          });
        }

        const wMatch = val.match(/^(\d+(\.\d+)?)k/i);
        const w = wMatch ? parseFloat(wMatch[1]) : 0;
        const m = val.match(/【(.+?)】/);
        const mat = m ? m[0] : '';

        if (isHeaderLabel(raw) || cats.length > 0 || w > 0 || mat) {
          rowHeaderInfo.push({
            catalogNos: cats,
            weight: w,
            shape: val.includes('単袋') ? '単袋' : 'R',
            minQty: (val.match(/(\d+)/) ? parseInt(val.match(/(\d+)/)[1]) : 0),
            lotType: val.includes('以上') || val.includes('~') || val.includes('～') ? 'above' : 'below',
            unit: val.includes('枚') ? 'pcs' : 'm',
            materialHint: mat,
            col: c
          });
          
          const isActuallyHeader = isHeaderLabel(raw) || cats.length > 0 || w > 0;
          // COMMENTED OUT THIS BUGGY CODE:
          // if (isActuallyHeader) {
          //  if (!colState[c]) colState[c] = { catalogNos: [], weight: 0, shape: 'R', minQty: 0, lotType: 'below', unit: 'm', materialHint: '' };
          //  colState[c].isHeaderCol = true;
          // }
        }
      }

      rowHeaderInfo.forEach(info => {
        for (let targetC = info.col; targetC < Math.min(row.length, info.col + 30); targetC++) {
          if (!colState[targetC]) colState[targetC] = { catalogNos: [], weight: 0, shape: 'R', minQty: 0, lotType: 'below', unit: 'm', materialHint: '' };
          if (info.catalogNos.length > 0) colState[targetC].catalogNos = info.catalogNos;
          if (info.weight > 0) colState[targetC].weight = info.weight;
          if (info.shape) colState[targetC].shape = info.shape;
          if (info.minQty > 0) { 
            colState[targetC].minQty = info.minQty; 
            colState[targetC].lotType = info.lotType;
            colState[targetC].unit = info.unit; 
          }
          if (info.materialHint) colState[targetC].materialHint = info.materialHint;
        }
      });

      const tempSPRows = {};
      row.forEach((cell, c) => {
        const p = parseFloat(String(cell || '').replace(/[,¥]/g, ''));
        if (!isNaN(p) && p > 0.1 && p < 10000) {
          if (rowHeaderInfo.some(info => info.col === c)) return;

          let color = 0;
          let minDist = 999;
          Object.keys(colorLabelMap).forEach(colStr => {
            const col = parseInt(colStr);
            const dist = c - col;
            if (dist >= 0 && dist <= 8 && dist < minDist) {
              color = colorLabelMap[col];
              minDist = dist;
            }
          });

          if (color > 0 && colState[c]?.catalogNos?.length > 0) {
            const state = colState[c];
            const catKey = state.catalogNos.join(',');
            const uniqueKey = `${catKey}_${state.weight}_${state.minQty}_${state.lotType}_${state.unit}_${color}`;
            
            let detectedType = null;
            let minLabelDist = 999;
            for (let dr = 0; dr <= 15; dr++) {
              if (r - dr < 0) break;
              const t = getSPRowType(String(rows[r - dr][c] || '').trim());
              if (t) { detectedType = t; minLabelDist = dr; break; }
            }
            for (let dc = 1; dc <= 10; dc++) {
              if (c - dc < 0) break;
              const t = getSPRowType(String(row[c - dc] || '').trim());
              if (t && dc < minLabelDist) { detectedType = t; minLabelDist = dc; break; }
            }
            
            console.log(`Found price: ${p} at col: ${c}, color: ${color}, type: ${detectedType}, uniqueKey: ${uniqueKey}`);

            if (detectedType) {
              if (!tempSPRows[uniqueKey]) {
                tempSPRows[uniqueKey] = {
                  catalogNos: state.catalogNos,
                  weight: state.weight,
                  shape: state.shape,
                  minQuantity: state.minQty,
                  lotType: state.lotType,
                  unit: state.unit,
                  materialHint: state.materialHint || sheetName,
                  colorPrices: {}
                };
              }
              if (!tempSPRows[uniqueKey].colorPrices[color]) {
                tempSPRows[uniqueKey].colorPrices[color] = { uru: 0, junD: 0, d: 0 };
              }
              tempSPRows[uniqueKey].colorPrices[color][detectedType] = p;
            }
          }
        }
      });

      Object.values(tempSPRows).forEach(newRow => {
        spMaster.push(newRow);
      });
    }
    console.log(`Found ${spMaster.length} items`);
  }
}

parseSPMasterFile('./sp_master.xlsx');
