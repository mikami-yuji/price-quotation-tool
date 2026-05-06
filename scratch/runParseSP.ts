import * as fs from 'fs';
import { parseSPMasterFile } from '../src/utils/excelUtils';

const filePath = '●【20260428】セレクトパック価格改定_社内用.xlsx';
const fileBuffer = fs.readFileSync(filePath);

try {
  // Convert Buffer to ArrayBuffer to satisfy the type requirement
  const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) as ArrayBuffer;
  const { data, diagnostics } = parseSPMasterFile(arrayBuffer);
  console.log('--- Diagnostics ---');
  console.log(diagnostics.join('\n'));
  console.log('--- Result ---');
  console.log('Total valid items parsed:', data.length);
  if (data.length > 0) {
    console.log('Sample data (first item):', JSON.stringify(data[0], null, 2));
  }
} catch (error) {
  console.error('Error during parsing:', error);
}
