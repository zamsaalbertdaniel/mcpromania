export default function Home() {
  return (
    <div className="container">
      <h1>mcpromania.ro</h1>
      <p className="subtitle">
        Gateway-ul MCP pentru afaceri din România.<br />
        Conectează Claude, Cursor, n8n sau Make direct la ANAF, Justiție, SEAP și sistemele de facturare — fără scripturi locale.
      </p>

      <div className="modules">
        <div className="module">
          <h3>Core Fiscal & Business</h3>
          <p>Interogare CUI ANAF (TVA, e-Factura, inactivitate), curs BNR și emitere facturi în SmartBill / Oblio din limbaj natural.</p>
        </div>
        <div className="module">
          <h3>Juridic & Risc</h3>
          <p>Verificare automată PortalJust: procese pe rol, insolvență, faliment înainte de a semna un contract.</p>
        </div>
        <div className="module">
          <h3>Achiziții Publice</h3>
          <p>Worker de sincronizare SEAP/SICAP + TED. Caută contracte cu statul și analizează competitorii.</p>
        </div>
      </div>

      <p>Lansare în curând. Remote MCP (Streamable HTTP) + API REST. Plan Free pentru validare.</p>

      <a href="https://github.com/zamsaalbertdaniel/mcpromania" className="cta">
        Vezi repository-ul pe GitHub
      </a>

      <div className="footer">
        Construit pentru dezvoltatori, contabili și antreprenori din România. <br />
        Securitate: AES-256-GCM, RLS multi-tenant, circuit breaker + cache.
      </div>
    </div>
  );
}