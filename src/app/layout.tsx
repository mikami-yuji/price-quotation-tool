import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "価格改定見積書・作成ツール",
  description: "得意先別 価格改定見積書・作成ツール",
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
