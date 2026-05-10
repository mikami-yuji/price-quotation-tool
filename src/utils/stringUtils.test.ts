import { describe, it, expect } from 'vitest';
import { shortenProductName, isSPCategory, normalizeCustomerName } from './stringUtils';

describe('stringUtils (Shared Utility Logic)', () => {

  describe('shortenProductName (Peeling Loop)', () => {
    it('前方の重量・仕様接頭辞を除去すること', () => {
      expect(shortenProductName('1kgポリ 銘柄名')).toBe('銘柄名');
      expect(shortenProductName('5k和紙 銘柄名')).toBe('銘柄名');
      expect(shortenProductName('0.5k バリア銘柄')).toBe('銘柄');
      expect(shortenProductName('２ｋｇ ポリ銘柄')).toBe('銘柄');
    });

    it('末尾のロット数・単位を除去すること', () => {
      expect(shortenProductName('銘柄名 1000枚')).toBe('銘柄名');
      expect(shortenProductName('銘柄名 500枚入')).toBe('銘柄名');
      expect(shortenProductName('銘柄名 100m')).toBe('銘柄名');
      expect(shortenProductName('銘柄名 1000')).toBe('銘柄名');
    });

    it('【 】内の材質コード等を除去すること', () => {
      expect(shortenProductName('【ポリ】銘柄名')).toBe('銘柄名');
      expect(shortenProductName('【和紙（雲竜）】銘柄名')).toBe('銘柄名');
      expect(shortenProductName('銘柄名 【12345】')).toBe('銘柄名');
    });

    it('混合ケースを正しく処理すること (ピーリングループの検証)', () => {
      // "5kg 【ポリ】銘柄名 1000枚" -> "【ポリ】銘柄名 1000枚" -> "銘柄名 1000枚" -> "銘柄名"
      expect(shortenProductName('5kg 【ポリ】銘柄名 1000枚')).toBe('銘柄名');
      expect(shortenProductName('１ｋｇ【バリア】銘柄名１０００枚')).toBe('銘柄名');
      expect(shortenProductName('別注５Ｋﾏｯﾄﾎﾟﾘ滋賀県産きぬひかりRA')).toBe('滋賀県産きぬひかり');
      expect(shortenProductName('SFマットポリ北海道ゆめぴりか')).toBe('北海道ゆめぴりか');
      expect(shortenProductName('新潟こしひかりRASPシルエット稲穂')).toBe('新潟こしひかり');
      expect(shortenProductName('バイオポリDH富山こしひかり')).toBe('富山こしひかり');
      expect(shortenProductName('MコンビポリDH兵庫県丹波こしひかり')).toBe('兵庫県丹波こしひかり');
      expect(shortenProductName('MポリポリDH福井こしひかり')).toBe('福井こしひかり');
    });

    it('除去すべきでない重要なキーワードは保持すること', () => {
      expect(shortenProductName('銘柄名（窓付）')).toBe('銘柄名(窓付)');
      expect(shortenProductName('銘柄名 印刷有')).toBe('銘柄名 印刷有');
    });
  });

  describe('isSPCategory (Normalized Detection)', () => {
    it('半角・全角のSPを正しく判定すること', () => {
      expect(isSPCategory('SP')).toBe(true);
      expect(isSPCategory('ＳＰ')).toBe(true);
      expect(isSPCategory('SPオフセット')).toBe(true);
      expect(isSPCategory('ＳＰロール')).toBe(true);
    });

    it('SP以外のカテゴリはfalseを返すこと', () => {
      expect(isSPCategory('別注')).toBe(false);
      expect(isSPCategory('既製品')).toBe(false);
      expect(isSPCategory('価格表')).toBe(false);
      expect(isSPCategory('')).toBe(false);
    });
  });

  describe('normalizeCustomerName (Business Rules)', () => {
    it('略称を正式名称に展開すること', () => {
      expect(normalizeCustomerName('(株)サンプル商事')).toBe('株式会社サンプル商事');
      expect(normalizeCustomerName('サンプル商事(株)')).toBe('サンプル商事株式会社');
      expect(normalizeCustomerName('サンプル商事(有)')).toBe('サンプル商事有限会社');
      expect(normalizeCustomerName('サンプル商事(㈱)')).toBe('サンプル商事株式会社');
    });

    it('余計なスペースをトリミングすること', () => {
      expect(normalizeCustomerName('  サンプル商事  ')).toBe('サンプル商事');
    });
  });
});
