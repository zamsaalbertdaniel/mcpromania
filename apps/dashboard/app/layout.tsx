import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'mcpromania.ro – MCP Gateway & API pentru România',
  description:
    'Platforma MCP & REST nativă pentru companii și agenți AI. Date în timp real: ANAF, BNR, Portal Just, ONRC, Verificare IBAN și Risc de Faliment / Insolvență.',
  other: {
    'google-adsense-account': 'ca-pub-2529817514139116',
  },
  icons: {
    icon: [
      { url: '/logo.png', sizes: 'any' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    apple: '/logo.png',
    shortcut: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2529817514139116"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
