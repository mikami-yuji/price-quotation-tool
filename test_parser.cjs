const XLSX = require('xlsx');
const fs = require('fs');
const parseSPMasterFile = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const results = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    let currentCatalogNos = [];
    let currentWeight = 0;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      const sellIdx = row.findIndex(c => String(c).trim() === '売');
      if (sellIdx !== -1) {
        const catalogNoFromRow = String(row[0] || '').trim();
        if (catalogNoFromRow && /^\d+/.test(catalogNoFromRow)) {
          currentCatalogNos = catalogNoFromRow.split(/[\s・/\n]+/).filter(Boolean);
        }
        let weight = 0;
        for (let i = sellIdx - 1; i >= 0; i--) {
          const val = parseFloat(String(row[i]).replace(/[^\d.]/g, ''));
          if (!isNaN(val) && val > 0 && val < 100) { weight = val; break; }
        }
        if (weight > 0) currentWeight = weight;
        const qtyStr = String(row[sellIdx - 1] || row[sellIdx - 2] || row[sellIdx - 3] || row[sellIdx - 4] || row[sellIdx - 5] || '');
        const minQty = parseInt(qtyStr.replace(/[^\d]/g, '')) || 0;
        const isRoll = qtyStr.includes('ｍ');
        const shape = isRoll ? 'R' : '単袋';
        const getPrices = (targetRow, marker) => {
          const mIdx = targetRow.findIndex(c => String(c).trim() === marker);
          if (mIdx === -1) return {};
          const p = {};
          for (let i = 1; i <= 4; i++) {
            const val = parseFloat(String(targetRow[mIdx + (i * 4) - 2] || ''));
            if (!isNaN(val)) p[i] = { uru: val, junD: val, d: val };
          }
          return p;
        };
        const sellPrices = {};
        for (let i = 1; i <= 4; i++) {
          const val = parseFloat(String(row[sellIdx + (i * 4) - 2] || ''));
          if (!isNaN(val)) sellPrices[i] = val;
        }
        const nextRow1 = rows[r + 1] || [];
        const nextRow2 = rows[r + 2] || [];
        const junDPrices = getPrices(nextRow1, '準');
        const dPrices = getPrices(nextRow2, 'Ｄ');
        const finalColorPrices = {};
        Object.keys(sellPrices).forEach(c => {
          finalColorPrices[c] = {
            uru: sellPrices[c],
            junD: junDPrices[c]?.junD || sellPrices[c],
            d: dPrices[c]?.d || sellPrices[c]
          };
        });
        if (currentCatalogNos.length > 0) {
          results.push({
            catalogNos: currentCatalogNos, weight: currentWeight,
            shape, minQuantity: minQty, colorPrices: finalColorPrices,
            sheetName: name
          });
        }
      }
    }
  }
  return results;
};
const filePath = 'C:\\Users\\asahi\\Dropbox\\●【20260428】セレクトパック価格改定_社内用.xlsx';
try {
    const buffer = fs.readFileSync(filePath);
    const data = parseSPMasterFile(buffer);
    console.log('Extracted ' + data.length + ' records.');
    if (data.length > 0) {
        console.log('Sample:', JSON.stringify(data[0], null, 2));
        const counts = {};
        data.forEach(d => counts[d.sheetName] = (counts[d.sheetName] || 0) + 1);
        console.log('Counts:', counts);
    }
} catch (e) { console.log(e.message); }
