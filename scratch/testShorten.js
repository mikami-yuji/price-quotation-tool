const { shortenProductName } = require('./src/utils/stringUtils.ts');

// Since we can't easily require ts in plain node without setup, let's just copy the logic
function shorten(name) {
  if (!name) return '';

  let cleaned = name.replace(/^([\s●◆■★]|【(?!新米|無洗米|玄米|特栽|特別栽培).*?】|（.*?）|\d+(\.\d+)?[Kk㎏Gｇ]|[M]?[ﾎﾟﾘﾗﾐｿﾌｸﾗ]+|DHT?|RA|RZ|SFM?|PB|S|V|T|真空|ラミ|ポリ|別注|ＴＳ|TS|ＲＡ|ＲＺ|新版)+/g, (m) => {
    if (m.includes('新米') || m.includes('無洗米') || m.includes('玄米') || m.includes('特栽') || m.includes('特別栽培')) return m;
    return '';
  });

  cleaned = cleaned.replace(/^([\s●◆■★]|【(?!新米|無洗米|玄米|特栽|特別栽培).*?】|（.*?）|\d+(\.\d+)?[Kk㎏Gｇ]|[M]?[ﾎﾟﾘﾗﾐｿﾌｸﾗ]+|DHT?|RA|RZ|SFM?|PB|S|V|T|真空|ラミ|ポリ|別注|ＴＳ|TS|ＲＡ|ＲＺ|新版)+/g, '');

  cleaned = cleaned.replace(/([\s(（]?(RZ|RA|ＳＰ|SP|ＲＡ|ＲＺ|無地).*$)|((RZ|RA|ＳＰ|SP|ＲＡ|ＲＺ|無地).*$)/, '');

  return cleaned.trim();
}

console.log(shorten('【新版】5K ﾎﾟﾘDH【Ｒ】滋賀こしひかりRAＳＰ丸窓雲竜柄無地'));
