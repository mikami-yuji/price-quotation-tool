const xlsx = require('xlsx');

function main() {
    const filePath = 'C:\\Users\\asahi\\.gemini\\値上げツール\\43006_幸南食糧（株）.xlsx';
    try {
        const workbook = xlsx.readFile(filePath);
        console.log("Sheets:", workbook.SheetNames);
        
        workbook.SheetNames.forEach(sheetName => {
            console.log(`\n--- Sheet: ${sheetName} ---`);
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            
            // Print first few rows to see structure
            const sampleRows = data.slice(0, 10);
            console.log("Data sample (first 10 rows):");
            sampleRows.forEach((row, i) => {
                console.log(`Row ${i + 1}:`, JSON.stringify(row));
            });
        });
    } catch (e) {
        console.error("Error reading file:", e);
    }
}

main();
