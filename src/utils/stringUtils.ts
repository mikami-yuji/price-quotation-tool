import { DecodedProductCode } from '../types';

/**
 * カテゴリ名からSP商品（またはＳＰ商品）であるかを判定する
 */
export const isSPCategory = (category: string): boolean => {
  if (!category) return false;
  const c = category.normalize('NFKC').toUpperCase();
  return c.includes('SP') && !c.includes('シルク');
};

/**
 * SP・シルク等の長い商品名（タイトル）から管理用コードや技術スペックを除去し、
 * ブランド核心部のみを抽出して短縮するユーティリティ
 */
export const shortenProductName = (name: string): string => {
  if (!name) return '';
  let n = name.normalize('NFKC').trim();
  
  // 1. 冒頭の記号を削除
  n = n.replace(/^[●★☆◆◇■□]+/g, '');
  
  // 2. 冒頭の仕様（重量・材質コード）を剥ぎ取る
  let prev = '';
  for (let i = 0; i < 5; i++) {
    prev = n;
    // 重量を消す
    n = n.replace(/^[0-9.]+[kK][gG]?[ 　]*/, '');
    // 材質キーワードを消す
    n = n.replace(/^[^ 　]*?(ポリ|ラミ|マット|バイオマス|バリア|ナイロン|和紙|クラフト|ｿﾌｸﾗ|ﾎﾟﾘ|ﾗﾐ)[^ 　]*[ 　]*/, '');
    // 形状に関わる【】は消すが、銘柄に関わるものは残す
    n = n.replace(/^【(単|R|ロール|単袋|枚|仕上|ＴＳ|TS|ＲＡ|ＲＺ|RA|RZ|新版)】[ 　]*/, '');
    // 英数字コードを消す (DH-123等)
    n = n.replace(/^[A-Z0-9-]{2,}[ 　]*/, '');
    
    if (n === prev) break;
  }

  // 3. 末尾の記号やデザイン名、SPコードなどをカット
  n = n.replace(/[ 　]*(RASP|CSP|SP).*$/, '');
  
  return n.trim() || name;
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
