const XLSX = require('xlsx');
const fs = require('fs');
const filePath = 'C:\\Users\\asahi\\Dropbox\\●【20260428】セレクトパック価格改定_社内用.xlsx';
try {
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    console.log('Sheets:', workbook.SheetNames);
    workbook.SheetNames.forEach(name => {
        const sheet = workbook.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        console.log('\n--- ' + name + ' ---');
        rows.slice(0, 40).forEach((row, i) => {
            const s = row.map(c => String(c).trim()).join('|');
            if (s.replace(/\|/g,'').length > 0) console.log(i + ': ' + s);
        });
        rows.forEach((row, r) => {
            const idx = row.findIndex(c => String(c).trim() === '売');
            if (idx !== -1) console.log('" 売\ found at Row ' + r + ', Col ' + idx);
 });
 });
} catch (e) { console.log(e.message); }
