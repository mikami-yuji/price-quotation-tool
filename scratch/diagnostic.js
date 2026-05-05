
/* eslint-disable */
const XLSX = require('xlsx');

const getSPRowType = (val) => {
  if (val === '売' || val === 'うる' || val === '通常') return 'uru';
  if (val === '準' || val === '準D' || val === '準Ｄ') return 'junD';
  if (val === 'Ｄ' || val === 'D') return 'd';
  return null;
}

const parseSPMasterFile = (arrayBuffer) => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const spMaster = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length === 0) continue;

    let sheetWeight = 0;
    const sheetWeightMatch = sheetName.match(/(\d+(\.\d+)?)\s*[kK㎏]/);
    if (sheetWeightMatch) sheetWeight = parseFloat(sheetWeightMatch[1]);

    const headerRows = [];
    for (let r = 0; r < Math.min(rows.length, 1000); r++) {
      const row = rows[r];
      if (Array.isArray(row) && row.some(c => {
        const t = String(c).trim();
        return t === '売' || t === '売単価' || t === '通常' || t === 'うる';
      })) {
        headerRows.push(r);
      }
    }

    if (headerRows.length === 0) continue;

    const stateByCol = {};
    let globalLastShape = null;
    if (sheetName.includes('単袋') || sheetName.includes('（単）') || /単袋/.test(sheetName)) {
      globalLastShape = '単袋';
    } else if (sheetName.includes('ロール') || sheetName.includes('（R）') || /ロール|Ｒ|R/.test(sheetName)) {
      globalLastShape = 'R';
    }
    if (!globalLastShape) {
      for (let r = 0; r < Math.min(rows.length, 20); r++) {
        const rowText = JSON.stringify(rows[r]);
        if (rowText.includes('単袋') || rowText.includes('（単）')) {
          globalLastShape = '単袋';
          break;
        } else if (rowText.includes('ロール') || rowText.includes('ロール用')) {
          globalLastShape = 'R';
          break;
        }
      }
    }

    for (const headerRowIdx of headerRows) {
      const headerRow = rows[headerRowIdx];
      const priceHeadersInRow = [];
      headerRow.forEach((cell, c) => {
        const t = String(cell).trim();
        if (t === '売' || t === '売単価' || t === '通常' || t === 'うる') {
          priceHeadersInRow.push({ col: c });
        }
      });

      for (const header of priceHeadersInRow) {
        const sellIdx = header.col;
        if (!stateByCol[sellIdx]) {
          stateByCol[sellIdx] = {
            lastCatalogNos: [],
            lastWeight: sheetWeight,
            lastMinQuantity: 0,
            lastUnit: 'm',
            lastShape: globalLastShape
          };
        }
        const state = stateByCol[sellIdx];
        const relativeOffsets = {};
        const nextHeader = priceHeadersInRow.find(h => h.col > sellIdx);
        const limit = nextHeader ? nextHeader.col : 1000;

        for (let i = 1; i <= 8; i++) {
          const zenI = String(i).replace(/[0-9]/g, m => String.fromCharCode(m.charCodeAt(0) + 0xFEE0));
          let found = false;
          for (let r = Math.max(0, headerRowIdx - 5); r <= headerRowIdx + 1; r++) {
            const row = rows[r];
            if (!Array.isArray(row)) continue;
            for (let c = sellIdx + 1; c < Math.min(row.length, limit); c++) {
              const val = String(row[c] || '').trim().replace(/[0-9]/g, m => String.fromCharCode(m.charCodeAt(0) + 0xFEE0));
              if (val.includes(`${zenI}色`) || (i <= 4 && val === zenI)) {
                relativeOffsets[i] = c - sellIdx;
                found = true;
                break;
              }
            }
            if (found) break;
          }
          if (!found) {
            if (i === 1) relativeOffsets[i] = 2;
            else {
              const prevOff = relativeOffsets[i - 1] || (i - 1) * 5;
              let gap = 5;
              if (i === 2 && (sheetName.includes('SF') || sheetName.includes('ＳＦ'))) gap = 4;
              relativeOffsets[i] = prevOff + gap;
            }
          }
        }

        for (let r = headerRowIdx; r < rows.length; r++) {
          const row = rows[r];
          if (!Array.isArray(row)) continue;
          if (r > headerRowIdx && headerRows.includes(r)) break;

          const rawVal = String(row[sellIdx] || '').trim();
          const rowType = getSPRowType(rawVal);
          const scanStart = Math.max(0, sellIdx - 15);
          const scanEnd = sellIdx;
          
          let currentRowCatalogNos = [];
          let currentRowWeight = 0;
          let currentRowShape = null;
          let minQuantity = 0;
          let currentUnit = 'm';

          for (let c = scanStart; c < scanEnd; c++) {
            const val = String(row[c] || '').trim().replace(/[０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0)).replace(/[ｋＫ㎏]/g, 'k');
            if (!val) continue;
            val.split(/[\n\s,、]+/).map(x => x.trim().replace(/[△▲]/g, '')).filter(x => /^\d{3,4}$/.test(x)).forEach(x => currentRowCatalogNos.push(x));
            
            // 重量の検知 (2k, 5, 10 等)
            const wMatch = val.match(/^\s*(\d+(?:\.\d+)?)\s*(?:k|K|㎏)?\s*$/i);
            if (wMatch) {
              const w = parseFloat(wMatch[1]);
              // 2kg〜30kgの範囲なら重量として扱う
              if (w >= 1.5 && w <= 35) currentRowWeight = w;
            }
            const qMatch = val.match(/(?:約|以上)?\s*(\d+)\s*(ｍ|m|枚)?(～|~)?$/);
            if (qMatch && !val.includes('k')) {
              const q = parseInt(qMatch[1]);
              if (q >= 10) {
                minQuantity = q;
                const unitStr = qMatch[2] || '';
                currentUnit = (unitStr === '枚' ? 'pcs' : 'm');
                if (unitStr === '枚') currentRowShape = '単袋';
                else if (unitStr === 'ｍ' || unitStr === 'm') currentRowShape = 'R';
              }
            }
            if (val.includes('単袋')) currentRowShape = '単袋';
            else if (val.includes('R') || val.includes('ロール')) currentRowShape = 'R';
          }

          if (rowType === 'uru') {
            if (currentRowCatalogNos.length === 0) currentRowCatalogNos = [...state.lastCatalogNos];
            else state.lastCatalogNos = [...currentRowCatalogNos];
            if (currentRowWeight === 0) currentRowWeight = state.lastWeight;
            else state.lastWeight = currentRowWeight;
            if (currentRowShape === null) currentRowShape = state.lastShape;
            else state.lastShape = currentRowShape;
            if (minQuantity === 0) minQuantity = state.lastMinQuantity;
            else { state.lastMinQuantity = minQuantity; state.lastUnit = currentUnit; }

            const spRow = {
              catalogNos: [...currentRowCatalogNos],
              weight: currentRowWeight,
              shape: currentRowShape || 'R',
              minQuantity: minQuantity,
              unit: state.lastUnit,
              colorPrices: {},
              materialHint: sheetName
            };
            for (let i = 1; i <= 8; i++) {
              const off = relativeOffsets[i];
              if (!off) continue;
              const p = parseFloat(String(row[sellIdx + off] || '').replace(/[^0-9.]/g, ''));
              if (!isNaN(p) && p > 0) {
                if (!spRow.colorPrices[i]) spRow.colorPrices[i] = { uru: 0, junD: 0, d: 0 };
                spRow.colorPrices[i].uru = p;
              }
            }
            if (spRow.catalogNos.length > 0 && spRow.minQuantity > 0) spMaster.push(spRow);
          } else if (rowType && spMaster.length > 0) {
            const lastEntry = spMaster[spMaster.length - 1];
            const matchCata = (currentRowCatalogNos.length > 0 ? currentRowCatalogNos : state.lastCatalogNos).join(',');
            if (lastEntry.catalogNos.join(',') === matchCata) {
              for (let i = 1; i <= 8; i++) {
                const off = relativeOffsets[i];
                if (!off) continue;
                const p = parseFloat(String(row[sellIdx + off] || '').replace(/[^0-9.]/g, ''));
                if (!isNaN(p) && p > 0) {
                  if (!lastEntry.colorPrices[i]) lastEntry.colorPrices[i] = { uru: 0, junD: 0, d: 0 };
                  lastEntry.colorPrices[i][rowType] = p;
                }
              }
            }
          }
        }
      }
    }
  }
  return spMaster;
};

const fs = require('fs');
const data = parseSPMasterFile(fs.readFileSync('sp_master.xlsx'));
const targets = data.filter(m => m.catalogNos.includes('852'));
console.log(JSON.stringify(targets, null, 2));
