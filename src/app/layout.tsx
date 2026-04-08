import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "見積書自動作成ツール",
  description: "得意先別 値上げ見積書作成ツール",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
