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
  for (let i = 0; i < 6; i++) {
    prev = n;
    // 冒頭の「別注」「ポリ別注」を消す
    n = n.replace(/^(別注|ポリ別注|米袋)[ 　]*/, '');
    // 重量を消す (5kg, 5K等)
    n = n.replace(/^[0-9,.]+[kK][gG]?[ 　]*/, '');
    // 冒頭の【 】で囲まれた情報を消す (例: 【ポリ】【和紙（雲竜）】)
    n = n.replace(/^【[^】]+】[ 　]*/, '');
    // 材質キーワード単体を消す (マット、ポリ等。スペースがなくても銘柄名の手前なら消す)
    n = n.replace(/^(ポリ|ラミ|マット|バイオマス|バリア|ナイロン|和紙|クラフト|ｿﾌｸﾗ|ﾎﾟﾘ|ﾗﾐ|透明|乳白)[ 　]*/, '');
    // 英数字コードを消す (DH-123, SF, LD等)
    n = n.replace(/^[A-Z0-9-]{2,}[ 　]*/, '');
    
    if (n === prev) break;
  }

  // 3. 末尾の仕様（枚数・SPコード等）をカット
  // 数量（1000枚, 100m, 500枚入 等）や【】コード、末尾型番を消す
  n = n.replace(/[ 　]*([0-9,.]+(枚|枚入|入|m|k[gG]?)?|RASP|CSP|SP|RA|RZ|【[A-Z0-9]+】)$/g, '');
  
  // 数値のみの末尾（ロット番号など）を消す（ただし名前全体が数値の場合は残す）
  if (/\s\d+$/.test(n)) {
    n = n.replace(/\s\d+$/, '');
  }

  return n.trim() || name;
};

/**
 * 顧客名の正規化（（株）や（㈱）を「株式会社」に、（有）を「有限会社」に展開し、トリミング）
 */
export const normalizeCustomerName = (name: string): string => {
  if (!name) return '';
  let n = name.trim();
  // (株), （株）, (㈱), （㈱）を「株式会社」に置換
  n = n.replace(/[(\uFF08][\u682A\u3231][)\uFF09]/g, '株式会社');
  // (有), （有）を「有限会社」に置換
  n = n.replace(/[(\uFF08]\u6709[)\uFF09]/g, '有限会社');
  return n;
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
