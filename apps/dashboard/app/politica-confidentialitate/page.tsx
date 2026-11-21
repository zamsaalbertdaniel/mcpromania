import Link from 'next/link';

export const metadata = {
  title: 'Politica de Confidențialitate – MCP România',
  description:
    'Politica de confidențialitate și utilizare cookie-uri pentru platforma mcpromania.ro conform GDPR și cerințelor Google AdSense.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-container">
      <div className="legal-content">
        <Link href="/" className="back-link">
          ← Înapoi la Pagina Principală
        </Link>
        <h1>Politica de Confidențialitate</h1>
        <p className="last-updated">Ultima actualizare: 22 noiembrie 2026</p>

        <section>
          <h2>1. Introducere</h2>
          <p>
            Platforma <strong>mcpromania.ro</strong> (&quot;noi&quot;, &quot;platforma&quot;)
            respectă confidențialitatea utilizatorilor săi și se conformează Regulamentului General
            privind Protecția Datelor (GDPR - Regulamentul UE 2016/679). Acest document explică
            modul în care colectăm, utilizăm și protejăm datele dumneavoastră atunci când accesați
            site-ul nostru și serviciile de tip API / MCP.
          </p>
        </section>

        <section>
          <h2>2. Datele colectate</h2>
          <p>Prin intermediul serviciilor noastre, prelucrăm următoarele categorii de date:</p>
          <ul>
            <li>
              <strong>Date publice despre persoane juridice:</strong> Coduri Unice de Înregistrare
              (CUI), numere de înregistrare la Registrul Comerțului, denumiri de companii, adrese
              ale sediilor sociale și stadii procesuale preluate din surse oficiale deschise (ANAF,
              Portal Just, BNR, ONRC).
            </li>
            <li>
              <strong>Date tehnice de acces:</strong> Adresa IP, tipul de browser, sistemul de
              operare și timestamp-ul cererilor, în scopul securității infrastructurii (Cloudflare
              WAF) și prevenirii abuzului de tip rate-limiting.
            </li>
            <li>
              <strong>Date colectate prin cookie-uri și servicii terțe de publicitate:</strong>{' '}
              Cookie-uri utilizate pentru analiză și afișarea reclamelor personalizate prin Google
              AdSense.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. Politica privind reclamele și Cookie-urile Google AdSense</h2>
          <p>
            Site-ul nostru utilizează <strong>Google AdSense</strong>, un serviciu de publicitate
            furnizat de Google LLC.
          </p>
          <ul>
            <li>
              Furnizorii terți, inclusiv Google, utilizează module cookie pentru a difuza anunțuri
              pe baza vizitelor anterioare ale unui utilizator pe acest site web sau pe alte
              site-uri web.
            </li>
            <li>
              Utilizarea cookie-urilor de publicitate de către Google permite companiei Google și
              partenerilor săi să difuzeze anunțuri pentru utilizatori pe baza vizitei lor pe
              site-urile noastre și/sau pe alte site-uri de pe internet.
            </li>
            <li>
              Utilizatorii pot renunța la publicitatea personalizată accesând{' '}
              <a
                href="https://www.google.com/settings/ads"
                target="_blank"
                rel="noopener noreferrer"
              >
                Setările pentru anunțuri Google
              </a>{' '}
              sau prin intermediul platformei{' '}
              <a
                href="https://www.aboutads.info/choices/"
                target="_blank"
                rel="noopener noreferrer"
              >
                AboutAds.info
              </a>
              .
            </li>
          </ul>
        </section>

        <section>
          <h2>4. Securitatea datelor</h2>
          <p>
            Infrastructura mcpromania.ro este securizată prin protocol SSL/TLS Full Strict, rețele
            Anycast Cloudflare, mecanisme avansate de Rate Limiting și baze de date cu politici Row
            Level Security (RLS). Cheile de acces API nu sunt stocate niciodată în clar.
          </p>
        </section>

        <section>
          <h2>5. Drepturile dumneavoastră conform GDPR</h2>
          <p>
            Conform GDPR, beneficiați de dreptul de acces la date, rectificare, ștergere,
            restricționare a prelucrării, portabilitate și dreptul de a nu face obiectul unei
            decizii individuale automatizate.
          </p>
          <p>
            Pentru orice solicitare legată de datele personale, ne puteți contacta la:{' '}
            <code>contact@mcpromania.ro</code>.
          </p>
        </section>
      </div>
    </main>
  );
}
