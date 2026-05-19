import { describe, it, expect } from 'vitest';
import { parseReadymadeMaster } from './excelUtils';

// excelUtils.ts の parseReadymadeMaster が「改定後 準D」と「改定後 D」を誤って混同せずに正しくパースできるかをテストする
describe('parseReadymadeMaster column matching', (): void => {
  it('should correctly distinguish between JunD and D segments', (): void => {
    const rows: unknown[][] = [
      ['ABSコード', '商品名', '改定後 売', '改定後 準D', '改定後 D', 'スライド数量'],
      ['001020201', '特穀米・山形つや姫', '40.0', '38.0', '36.5', '0']
    ];

    const result = parseReadymadeMaster(rows);
    expect(result.length).toBe(1);
    expect(result[0].productCode).toBe('001020201');
    expect(result[0].normal.uru).toBe(40.0);
    expect(result[0].normal.junD).toBe(38.0);
    expect(result[0].normal.d).toBe(36.5);
  });
});
