const xlsx = require('xlsx');
const path = require('path');

function main() {
    const fileName = process.argv[2] || 'readymade_master_check.xlsx';
    const filePath = path.isAbsolute(fileName) ? fileName : path.join(process.cwd(), fileName);
    
    try {
        const workbook = xlsx.readFile(filePath);
        console.log("Sheets:", workbook.SheetNames);
        
        workbook.SheetNames.forEach(sheetName => {
            console.log(`\n--- Sheet: ${sheetName} ---`);
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            
            if (data.length > 0) {
                console.log("Headers (all columns):");
                console.log(JSON.stringify(data[0]));
                
                console.log("\nData sample (first 3 rows of data):");
                data.slice(1, 4).forEach((row, i) => {
                    console.log(`Row ${i + 2}:`, JSON.stringify(row));
                });
            }
        });
    } catch (e) {
        console.error("Error reading file:", e);
    }
}

main();
