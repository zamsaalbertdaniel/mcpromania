import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'mcpromania.ro – MCP Gateway pentru România',
  description: 'Platforma MCP nativă pentru date ANAF, PortalJust, SEAP și integrări de facturare. Conectează AI-ul tău (Claude, Cursor) la infrastructura reală din România.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}