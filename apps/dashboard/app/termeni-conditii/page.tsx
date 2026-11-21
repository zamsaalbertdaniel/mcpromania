import Link from 'next/link';

export const metadata = {
  title: 'Termeni și Condiții – MCP România',
  description: 'Termenii și condițiile de utilizare a platformei și a API-ului mcpromania.ro.',
};

export default function TermsPage() {
  return (
    <main className="legal-container">
      <div className="legal-content">
        <Link href="/" className="back-link">
          ← Înapoi la Pagina Principală
        </Link>
        <h1>Termeni și Condiții de Utilizare</h1>
        <p className="last-updated">Ultima actualizare: 22 noiembrie 2026</p>

        <section>
          <h2>1. Acceptarea termenilor</h2>
          <p>
            Prin accesarea platformei <strong>mcpromania.ro</strong> sau prin utilizarea API-ului și
            a serverului Model Context Protocol (MCP), sunteți de acord cu prezentele condiții de
            utilizare. Dacă nu sunteți de acord, vă rugăm să încetați utilizarea serviciilor
            noastre.
          </p>
        </section>

        <section>
          <h2>2. Descrierea serviciilor</h2>
          <p>
            mcpromania.ro oferă o punte tehnologică (Gateway MCP & REST) pentru interogarea și
            agregarea datelor deschise și publice din România (ANAF, Banca Națională a României,
            Portalul Instanțelor de Judecată Just.ro, Registrul Comerțului).
          </p>
          <p>
            Datele sunt furnizate în scop informativ, analitic și operațional pentru dezvoltatori de
            inteligență artificială, integratori de sisteme și companii.
          </p>
        </section>

        <section>
          <h2>3. Limite de utilizare și Rate Limiting</h2>
          <p>
            Pentru a asigura disponibilitatea echitabilă a resurselor pentru toți utilizatorii,
            aplicăm politici stricte de limitare a ratei de cereri (Rate Limiting). Tentativele de
            atac cibernetic, scraping abuziv sau încercările de bypass al măsurilor de securitate
            vor atrage blocarea automată prin Cloudflare WAF.
          </p>
        </section>

        <section>
          <h2>4. Limitarea răspunderii</h2>
          <p>
            Informațiile sunt agregate în timp real direct din sursele oficiale menționate. Nu
            garantăm disponibilitatea neîntreruptă a serverelor autorităților publice partenere
            (ANAF, Just.ro), deși implementăm sisteme avansate de cache SWR și Circuit Breakers
            pentru minimizarea indisponibilităților.
          </p>
        </section>

        <section>
          <h2>5. Contact</h2>
          <p>
            Pentru întrebări comerciale, asistență tehnică sau semnalări de securitate, ne puteți
            scrie la: <code>contact@mcpromania.ro</code>.
          </p>
        </section>
      </div>
    </main>
  );
}
