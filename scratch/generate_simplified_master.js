const XLSX = require('xlsx');
const path = require('path');

// サンプルデータの作成
const data = [
  ['カタログNo', '重量(kg)', '数量', '単位', '価格区分', '1色', '2色', '3色', '4色'],
  ['968', 2, 300, 'm', '売', 196.0, 226.0, 256.0, 286.0],
  ['968', 2, 300, 'm', '準', 186.5, 216.5, 246.5, 276.5],
  ['968', 2, 300, 'm', 'D', 173.5, 203.5, 233.5, 263.5],
  ['968', 2, 600, 'm', '売', 186.0, 201.0, 216.0, 231.0],
  ['968', 2, 600, 'm', '準', 177.0, 191.0, 205.5, 219.5],
  ['968', 2, 600, 'm', 'D', 163.5, 178.5, 193.5, 208.5],
  ['968', 2, 1200, 'm', '売', 160.0, 175.0, 190.0, 205.0],
  ['968', 2, 1200, 'm', '準', 151.0, 165.0, 179.5, 193.5],
  ['968', 2, 1200, 'm', 'D', 147.5, 162.5, 177.5, 192.5],
];

// ワークブックとシートの作成
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(data);

// シートをワークブックに追加
XLSX.utils.book_append_sheet(wb, ws, 'SPマスター_サンプル');

// ファイルの保存
const outputPath = path.join(__dirname, 'SP_Simplified_Master_Sample.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`Successfully created sample Excel file at: ${outputPath}`);
