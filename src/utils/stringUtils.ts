import { DecodedProductCode } from '../types';

/**
 * SP・シルク等の長い商品名（タイトル）から管理用コードや技術スペックを除去し、
 * ブランド核心部のみを抽出して短縮するユーティリティ
 */
export const shortenProductName = (name: string): string => {
  if (!name) return '';

  // 1. 接頭辞の削除
  // 記号類、注記、重量（小数含, G/K等）、材質記号（ﾎﾟﾘ, ﾗﾐ, SF, ｿﾌｸﾗ, 真空, ラミ等）、共通コードを前方一致で削除
  // ただし「新米」「無洗米」「玄米」「特栽」などの重要な属性は残す
  let cleaned = name.replace(/^([\s●◆■★]|【(?!新米|無洗米|玄米|特栽|特別栽培).*?】|（.*?）|[0-9０-９]+([.．][0-9０-９]+)?[KkＫｋ㎏GｇＧｇ]|[M]?[ﾎﾟﾘﾗﾐｿﾌｸﾗ]+|DHT?|RA|RZ|SFM?|ＳＦＭ?|PB|S|V|T|真空|ラミ|ポリ|別注|ＴＳ|TS|ＲＡ|ＲＺ|新版|ﾏｯﾄ|マット|MAT)+/g, (m) => {
    if (m.includes('新米') || m.includes('無洗米') || m.includes('玄米') || m.includes('特栽') || m.includes('特別栽培')) return m;
    return '';
  });

  // 2度洗いで確実に除去
  cleaned = cleaned.replace(/^([\s●◆■★]|【(?!新米|無洗米|玄米|特栽|特別栽培).*?】|（.*?）|[0-9０-９]+([.．][0-9０-９]+)?[KkＫｋ㎏GｇＧｇ]|[M]?[ﾎﾟﾘﾗﾐｿﾌｸﾗ]+|DHT?|RA|RZ|SFM?|ＳＦＭ?|PB|S|V|T|真空|ラミ|ポリ|別注|ＴＳ|TS|ＲＡ|ＲＺ|新版|ﾏｯﾄ|マット|MAT)+/g, '');

  // 2. 接尾辞の削除
  // 管理コード (RZ, SP等) 以降をすべて削除
  cleaned = cleaned.replace(/([\s(（]?(RZ|RA|ＳＰ|SP|ＲＡ|ＲＺ|無地|R\s*$|Ｒ\s*$).*$)|((RZ|RA|ＳＰ|SP|ＲＡ|ＲＺ|無地|R\s*$|Ｒ\s*$).*$)/, '');

  return cleaned.trim();
};

/**
 * 顧客名の正規化（（株）や（㈱）を「株式会社」に統一）
 */
export const normalizeCustomerName = (name: string): string => {
  if (!name) return '';
  // (株), （株）, (㈱), （㈱）を「株式会社」に置換
  return name.replace(/[(\uFF08][\u682A\u3231][)\uFF09]/g, '株式会社');
};

/**
 * SPの商品コード（9桁）をデコードする
 * 例: 008100501 -> 00810(カタログNo 810), 05(5kg), 01(単袋)
 * 末尾 01=単袋, 02/03=R
 */
export const decodeSPProductCode = (code: string): DecodedProductCode | null => {
  if (!code) return null;
  // 空白を除去
  const cleanCode = code.replace(/\s+/g, '');
  if (cleanCode.length !== 9 || !/^\d+$/.test(cleanCode)) return null;

  const catalogNo = parseInt(cleanCode.substring(0, 5), 10).toString();
  const weight = parseInt(cleanCode.substring(5, 7), 10);
  const shapeCode = cleanCode.substring(7, 9);

  let shape: 'R' | '単袋' = 'R';
  if (shapeCode === '01') {
    shape = '単袋';
  } else if (shapeCode === '02' || shapeCode === '03') {
    shape = 'R';
  } else {
    // 01以外は基本Rとするが、将来的に他のコードがあればここに追加
    shape = 'R';
  }

  return { catalogNo, weight, shape };
};
