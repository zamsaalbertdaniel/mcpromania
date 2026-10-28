"use client";

import { useEffect, useState } from 'react';

const LOGO_SRC = "https://raw.githubusercontent.com/zamsaalbertdaniel/mcpromania/main/logo.png";

const DATA_STREAMS = [
  "MCP.initialize → session.ready",
  "tool.anaf.lookup_cui(RO12345678)",
  "ANAF.status: ACTIV | TVA: DA | e-Factura: DA",
  "tool.portaljust.search_cases(cui=...)",
  "PortalJust: 0 insolvență | 2 dosare civile",
  "tool.bnr.exchange_rate(EUR)",
  "BNR: 1 EUR = 4.97 RON",
  "tool.seap.sync_tenders(cpv=48000000)",
  "SEAP: 14 anunțuri noi sincronizate",
  "tool.smartbill.create_invoice(...)",
  "circuit_breaker: CLOSED | cache_hit: 94%",
  "rate_limit: 12/1000 (Pro plan)",
  "MCP.tool_call.completed in 187ms",
  "multi_tenant.rls: enforced",
  "AES-256-GCM key_rotated",
];

export default function Home() {
  const [streams, setStreams] = useState<string[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setStreams(prev => {
        const next = [...prev, DATA_STREAMS[Math.floor(Math.random() * DATA_STREAMS.length)]];
        return next.slice(-6);
      });
    }, 1100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="scene">
      <div className="grid-bg" />
      <div className="glow-orbs">
        <div className="orb blue" />
        <div className="orb gold" />
        <div className="orb red" />
      </div>

      <div className="logo-container">
        <div className="logo-pulse" />
        <img src={LOGO_SRC} alt="MCP Romania" className="logo" />
        <div className="scanline" />
      </div>

      <div className="data-streams">
        {streams.map((s, i) => (
          <div key={i} className="stream" style={{ animationDelay: `${i * 0.15}s` }}>
            {s}
          </div>
        ))}
      </div>

      <h1 className="brand">MCP ROMANIA</h1>
      <p className="coming-soon">ÎN CURÂND</p>
    </div>
  );
}