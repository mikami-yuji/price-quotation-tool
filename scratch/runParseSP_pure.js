const XLSX = require('xlsx');
const fs = require('fs');

const filePath = '●【20260428】セレクトパック価格改定_社内用.xlsx';
const fileBuffer = fs.readFileSync(filePath);

function parseSPMasterFile(fileData) {
  const workbook = XLSX.read(fileData, { type: 'buffer' });
  let spMaster = [];
  const diagnostics = [];

  const getSPRowType = (val) => {
    const v = String(val || '').normalize('NFKC').trim();
    if (v.length > 8) return null; 
    if (v.includes('売') || v.includes('通常') || v.includes('うる')) return 'uru';
    if (v.includes('準') || v.includes('JUN')) return 'junD';
    if (v.includes('D') || v.includes('バラ')) return 'd';
    return null;
  };

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length === 0) continue;

    let catalogCols = [];
    let weightCols = [];
    let lotCols = [];
    let colorLabelMap = {};

    for (let r = 0; r < Math.min(rows.length, 40); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      row.forEach((cell, c) => {
        const s = String(cell || '').normalize('NFKC').trim();
        const v = s.replace(/\s+/g, '').toLowerCase();
        if (v.includes('カタログ') || v.includes('no') || v.includes('№') || v.includes('品番') || v.includes('コード')) {
          if (!catalogCols.includes(c)) catalogCols.push(c);
        }
        if (v.includes('kg') || v.includes('重量')) {
          if (!weightCols.includes(c)) weightCols.push(c);
        }
        if (v.includes('数量') || v.includes('ロット') || v.includes('枚数') || v.includes('本数')) {
          if (!lotCols.includes(c)) lotCols.push(c);
        }
        const m = v.match(/([1-8])色/);
        if (m) colorLabelMap[c] = parseInt(m[1]);
        else if (/^[1-8]$/.test(v) && r > 5) colorLabelMap[c] = parseInt(v);
      });
    }

    let sheetRecordCount = 0;
    const addedUniqueKeys = new Set();
    const colState = {};

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const updateState = (col, rawVal, type) => {
        if (!rawVal) return;
        const normVal = String(rawVal).normalize('NFKC');
        for (let targetC = 0; targetC < 100; targetC++) {
          if (Math.abs(targetC - col) > 35) continue;
          if (!colState[targetC]) colState[targetC] = { catalogNos: [], weight: 0, minQty: 0, lotType: 'below', unit: 'm', lastPriceRow: -1 };
          if (type === 'cat') {
            const cats = [];
            normVal.split(/[\n\s,、/]+/).forEach(x => {
              const clean = x.replace(/[△▲・No.]/g, '').trim();
              if (/^\d{3,10}(-\d{1,5})?$/.test(clean)) cats.push(clean.replace(/-/g, ''));
            });
            if (cats.length > 0) {
              const isNewBlock = colState[targetC].lastPriceRow !== -1 && r > colState[targetC].lastPriceRow + 2;
              if (isNewBlock) {
                colState[targetC].catalogNos = [...cats];
                colState[targetC].lastPriceRow = -1;
              } else {
                cats.forEach(cat => {
                  if (!colState[targetC].catalogNos.includes(cat)) colState[targetC].catalogNos.push(cat);
                });
              }
            }
          } else if (type === 'weight') {
            const wMatch = normVal.replace(/\s+/g, '').match(/(\d+(\.\d+)?)/);
            if (wMatch) colState[targetC].weight = parseFloat(wMatch[1]);
          } else if (type === 'lot') {
            const cleanLot = normVal.replace(/\s+/g, '');
            const minQtyMatch = cleanLot.match(/(\d+)/);
            if (minQtyMatch) {
              colState[targetC].minQty = parseInt(minQtyMatch[1]);
              colState[targetC].lotType = cleanLot.includes('以上') || cleanLot.includes('~') || cleanLot.includes('～') ? 'above' : 'below';
              colState[targetC].unit = cleanLot.includes('枚') ? 'pcs' : 'm';
            }
          }
        }
      };

      catalogCols.forEach(c => updateState(c, String(row[c] || ''), 'cat'));
      weightCols.forEach(c => updateState(c, String(row[c] || ''), 'weight'));
      lotCols.forEach(c => updateState(c, String(row[c] || ''), 'lot'));

      row.forEach((cell, c) => {
        const valStr = String(cell || '').trim();
        if (!valStr || !/^[0-9,.]+$/.test(valStr.replace(/[売準D]/g, ''))) return;
        const p = parseFloat(valStr.replace(/[,売準D]/g, ''));
        if (isNaN(p) || p <= 0.1 || p >= 10000) return;

        let color = 0;
        let minDist = 999;
        Object.keys(colorLabelMap).forEach(colStr => {
          const col = parseInt(colStr);
          const dist = c - col;
          if (dist >= 0 && dist <= 12 && dist < minDist) {
            color = colorLabelMap[col];
            minDist = dist;
          }
        });

        const state = colState[c];
        if (color > 0 && state && state.catalogNos.length > 0) {
          state.lastPriceRow = r;
          let detectedType = null;
          for (let dr = 0; dr <= 8; dr++) {
            const checkR = r - dr;
            if (checkR < 0) break;
            const t = getSPRowType(String(rows[checkR]?.[c] || ''));
            if (t) { detectedType = t; break; }
            for (let dc = 1; dc <= 15; dc++) {
              if (c - dc < 0) break;
              const tt = getSPRowType(String(rows[checkR]?.[c - dc] || ''));
              if (tt) { detectedType = tt; break; }
            }
            if (detectedType) break;
          }

          if (detectedType) {
            state.catalogNos.forEach(catNo => {
              const uniqueKey = `${catNo}_${state.weight}_${state.minQty}_${state.lotType}_${state.unit}`;
              let existing = spMaster.find(ex => 
                ex.materialHint === sheetName &&
                ex.catalogNos[0] === catNo && 
                ex.weight === state.weight && 
                ex.minQuantity === state.minQty && 
                ex.lotType === state.lotType && 
                ex.unit === state.unit
              );

              if (!existing) {
                existing = {
                  catalogNos: [catNo], weight: state.weight, shape: 'R',
                  minQuantity: state.minQty, lotType: state.lotType, unit: state.unit,
                  materialHint: sheetName, colorPrices: {}
                };
                spMaster.push(existing);
                if (!addedUniqueKeys.has(uniqueKey)) {
                  sheetRecordCount++;
                  addedUniqueKeys.add(uniqueKey);
                }
              }
              if (!existing.colorPrices[color]) existing.colorPrices[color] = { uru: 0, junD: 0, d: 0 };
              existing.colorPrices[color][detectedType] = p;
            });
          }
        }
      });
    }
    diagnostics.push(`${sheetName}: ${sheetRecordCount}件`);
  }
  return { spMaster, diagnostics };
}

const { spMaster } = parseSPMasterFile(fileBuffer);
console.log('--- Debug: First 5 records ---');
console.log(JSON.stringify(spMaster.slice(0, 5), null, 2));

console.log('--- Debug: Search for Polypoly ---');
const poly = spMaster.filter(m => m.materialHint.includes('ポリポリ'));
console.log('Polypoly records found:', poly.length);
if (poly.length > 0) {
  console.log('First Polypoly record:', JSON.stringify(poly[0], null, 2));
}
