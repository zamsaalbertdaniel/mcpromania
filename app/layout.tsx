import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'mcpromania.ro – MCP Gateway pentru România',
  description: 'Platforma MCP nativă pentru date ANAF, PortalJust, SEAP și integrări de facturare. Conectează AI-ul tău (Claude, Cursor) la infrastructura reală din România.',
  icons: {
    icon: [
      { url: '/logo.png', sizes: 'any' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    apple: '/logo.png',
    shortcut: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro">
      <head>
        <link rel="icon" href="/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}