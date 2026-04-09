/**
 * SP・シルク等の長い商品名（タイトル）から管理用コードや技術スペックを除去し、
 * ブランド核心部のみを抽出して短縮するユーティリティ
 */
export const shortenProductName = (name: string): string => {
  if (!name) return '';

  // 1. 接頭辞の削除
  // 記号類、注記、重量（小数含, G/K等）、材質記号（ﾎﾟﾘ, ﾗﾐ, SF, ｿﾌｸﾗ, 真空, ラミ等）、共通コードを前方一致で削除
  // ただし「新米」「無洗米」「玄米」「特栽」などの重要な属性は残す
  let cleaned = name.replace(/^([\s●◆■★]|【(?!新米|無洗米|玄米|特栽|特別栽培).*?】|（.*?）|\d+(\.\d+)?[Kk㎏Gｇ]|[M]?[ﾎﾟﾘﾗﾐｿﾌｸﾗ]+|DHT?|RA|RZ|SFM?|PB|S|V|T|真空|ラミ|ポリ|別注|ＴＳ|TS|ＲＡ|ＲＺ)+/g, (m) => {
    if (m.includes('新米') || m.includes('無洗米') || m.includes('玄米') || m.includes('特栽') || m.includes('特別栽培')) return m;
    return '';
  });

  // 2度洗いで確実に除去
  cleaned = cleaned.replace(/^([\s●◆■★]|【(?!新米|無洗米|玄米|特栽|特別栽培).*?】|（.*?）|\d+(\.\d+)?[Kk㎏Gｇ]|[M]?[ﾎﾟﾘﾗﾐｿﾌｸﾗ]+|DHT?|RA|RZ|SFM?|PB|S|V|T|真空|ラミ|ポリ|別注|ＴＳ|TS|ＲＡ|ＲＺ)+/g, '');

  // 2. 接尾辞の削除
  // 管理コード (RZ, SP等) 以降をすべて削除
  cleaned = cleaned.replace(/([\s(（]?(RZ|RA|ＳＰ|SP|ＲＡ|ＲＺ|無地).*$)|((RZ|RA|ＳＰ|SP|ＲＡ|ＲＺ|無地).*$)/, '');

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
