'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

type AITab = 'openai' | 'gemini' | 'claude' | 'cursor' | 'windsurf' | 'n8n' | 'langchain';

interface ToolInfo {
  key: string;
  name: string;
  badge: string;
  category: string;
  source: string;
  endpoint: string;
  mcpTool: string;
  description: string;
  capabilities: string[];
  paramFormat: string;
}

const TOOLS_CATALOG: ToolInfo[] = [
  {
    key: 'anaf_lookup',
    name: 'ANAF Info & TVA',
    badge: '🏛️',
    category: 'Fiscalitate & Conformitate',
    source: 'Ministerul Finanțelor / ANAF WebServices',
    endpoint: 'GET /api/v1/anaf/company/:cui',
    mcpTool: 'anaf_lookup',
    description:
      'Interogare oficială în timp real pentru verificarea stării de funcționare a societăților comerciale din România, regimul de TVA și e-Factura.',
    capabilities: [
      'Stare fiscală curentă: ACTIV / INACTIV / RADIAT',
      'Plătitor TVA, TVA la încasare și Split TVA',
      'Verificare înregistrare în registrul RO e-Factura',
      'Denumire legală completă, sediu social și adresă fiscală',
    ],
    paramFormat: 'Cod Unic de Înregistrare (CUI / CIF) (ex: 14399840 sau RO14399840)',
  },
  {
    key: 'insolvency_risk_check',
    name: 'Insolvență & BPI Just',
    badge: '⚖️',
    category: 'Risc & Conformitate',
    source: 'Buletinul Procedurilor de Insolvență & Just.ro',
    endpoint: 'GET /api/v1/insolvency/check/:cui',
    mcpTool: 'insolvency_risk_check',
    description:
      'Diagnostic automat de solvabilitate comercială. Diferențiază inteligent calitatea de debitor (risc real) de cea de creditor (recuperare creanțe).',
    capabilities: [
      'Clasificare de risc sintetică: IN_BONIS / FALIMENT / CONCORDAT',
      'Filtrare automată: elimină alarmele false pentru creditori',
      'Număr dosare deschise pe Legea 85/2014 și instanțe judecătorești',
      'Identificare practician în insolvență / lichidator judiciar',
    ],
    paramFormat: 'CUI companie (ex: 14399840)',
  },
  {
    key: 'bnr_exchange_rate',
    name: 'Curs Valutar BNR',
    badge: '💶',
    category: 'Financiar & Valutar',
    source: 'Banca Națională a României',
    endpoint: 'GET /api/v1/bnr/exchange-rate',
    mcpTool: 'bnr_exchange_rate',
    description:
      'Cursuri valutare oficiale emise de BNR în fiecare zi bancară pentru 32+ valute internaționale, gramul de aur (XAU) și XDR.',
    capabilities: [
      '32+ valute oficiale actualizate zilnic la ora 13:00',
      'Calcul automat cu multiplicatori oficiali (ex: 100 HUF, 100 JPY)',
      'Revalidare inteligentă în fundal (Stale-While-Revalidate)',
      'Latență de răspuns sub 50ms direct din memorie cache',
    ],
    paramFormat: 'Opțional: Cod ISO valută (ex: EUR, USD, GBP, CHF)',
  },
  {
    key: 'iban_validate',
    name: 'Validare IBAN România',
    badge: '💳',
    category: 'Plăți & Trezorerie',
    source: 'Standard ISO 13616 & Registrul Bancar BNR',
    endpoint: 'GET /api/v1/iban/validate/:iban',
    mcpTool: 'iban_validator',
    description:
      'Validare matematică algoritmică a conturilor bancare din România conform standardului ISO 13616 (MOD97), cu detecția automată a băncii.',
    capabilities: [
      'Verificare algoritm MOD97 în sub 5 milisecunde',
      'Identificare cod bancă (ex: BTRL, INGB, RNCB, BRDE)',
      'Extragere denumire completă instituție bancară și cod BIC',
      'Prevenire erori de tranzacționare în aplicații de plăți și ERP',
    ],
    paramFormat: 'Cont IBAN românesc complet (24 caractere, prefix RO)',
  },
  {
    key: 'portal_just_search',
    name: 'Portal Justiție (Dosare)',
    badge: '📜',
    category: 'Juridic & Instanțe',
    source: 'Ministerul Justiției (portalquery.just.ro)',
    endpoint: 'GET /api/v1/just/cases',
    mcpTool: 'portal_just_search',
    description:
      'Căutare automată de jurisprudență și dosare aflate pe rolul instanțelor de judecată (judecătorii, tribunale, curți de apel) din România.',
    capabilities: [
      'Interogare după denumire companie, CUI sau număr dosar',
      'Stadiu procesual curent: Fond, Apel, Recurs',
      'Părți în dosar (Reclamant, Pârât, Creditor, Debitor)',
      'Obiectul dosarului și termene de judecată',
    ],
    paramFormat: 'CUI, denumire companie sau număr dosar (ex: 1240/3/2026)',
  },
  {
    key: 'onrc_validate_regcom',
    name: 'Validare RegCom ONRC',
    badge: '🏢',
    category: 'Registrul Comerțului',
    source: 'Oficiul Național al Registrului Comerțului',
    endpoint: 'GET /api/v1/onrc/validate/:numar',
    mcpTool: 'onrc_validate_regcom',
    description:
      'Validare sintactică a structurii numărului de înregistrare la Registrul Comerțului (J/F/C/D), identificând județul și anul de înființare.',
    capabilities: [
      'Validare format legal societăți (J), persoane fizice (F) etc.',
      'Identificare automată indicativ județ (40 = București, 04 = Bacău)',
      'Extragere număr secvențial și an calendaristic',
      'Standardizare pentru baze de date interne CRM/ERP',
    ],
    paramFormat: 'Număr RegCom (ex: J40/372/2002 sau J04/137/1992)',
  },
  {
    key: 'onrc_company_lookup',
    name: 'Identificare Profil Firmă',
    badge: '🔍',
    category: 'Registrul Comerțului',
    source: 'ONRC & Reconciliere Date Naționale',
    endpoint: 'GET /api/v1/onrc/company/:cui',
    mcpTool: 'onrc_company_lookup',
    description:
      'Reconciliere automată a identificatorilor comerciali: CUI fiscal, EUID (European Unique Identifier) și număr de Registrul Comerțului.',
    capabilities: [
      'Corelare automată între CUI și numărul de ordine la RegCom',
      'Generare identificator european unic (EUID)',
      'Formă juridică de organizare (SRL, SA, PFA)',
      'Sediu social și localizare administrativă',
    ],
    paramFormat: 'CUI fiscal (ex: 14399840) sau număr RegCom',
  },
];

export default function Home() {
  const [activeAITab, setActiveAITab] = useState<AITab>('openai');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2200);
  };

  const aiConfigs: Record<
    AITab,
    { title: string; subtitle: string; code: string; language: string }
  > = {
    openai: {
      title: 'OpenAI ChatGPT (Custom GPT & Actions)',
      subtitle:
        'În GPT Builder > Configure > Actions, alege "Import from URL" și introdu https://api.mcpromania.ro/openapi.json',
      code: JSON.stringify(
        {
          openapi: '3.1.0',
          info: {
            title: 'MCP România – Enterprise Public Data API',
            version: '1.0.0',
            description:
              'Date oficiale în timp real: ANAF, BPI Insolvență, Portal Just, BNR, IBAN și ONRC',
          },
          servers: [{ url: 'https://api.mcpromania.ro' }],
          paths: {
            '/api/v1/insolvency/check/{cui}': {
              get: {
                operationId: 'insolvency_risk_check',
                summary: 'Verificare risc insolvență și dosare de faliment BPI',
                parameters: [
                  { name: 'cui', in: 'path', required: true, schema: { type: 'string' } },
                ],
              },
            },
            '/api/v1/anaf/cui/{cui}': {
              get: {
                operationId: 'anaf_lookup',
                summary: 'Interogare stare fiscală, TVA și e-Factura ANAF',
                parameters: [
                  { name: 'cui', in: 'path', required: true, schema: { type: 'string' } },
                ],
              },
            },
            '/api/v1/just/cases': {
              get: {
                operationId: 'portal_just_search',
                summary: 'Căutare dosare instanțe judecătorești portal.just.ro',
                parameters: [
                  { name: 'query', in: 'query', required: true, schema: { type: 'string' } },
                ],
              },
            },
            '/api/v1/bnr/exchange-rate': {
              get: {
                operationId: 'bnr_exchange_rate',
                summary: 'Curs valutar oficial BNR (EUR, USD, GBP, CHF)',
                parameters: [
                  { name: 'currency', in: 'query', required: false, schema: { type: 'string' } },
                ],
              },
            },
            '/api/v1/iban/validate/{iban}': {
              get: {
                operationId: 'iban_validate',
                summary: 'Validare algoritm cont IBAN (MOD97) și bancă',
                parameters: [
                  { name: 'iban', in: 'path', required: true, schema: { type: 'string' } },
                ],
              },
            },
          },
        },
        null,
        2
      ),
      language: 'json',
    },
    gemini: {
      title: 'Google Gemini (Function Calling & Extensions)',
      subtitle:
        'Declară uneltele MCP România direct în apelurile Gemini SDK (Python / TypeScript).',
      code: `import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Declară unealta MCP România pentru verificări legale & fiscale
const mcpRomaniaTools = [{
  functionDeclarations: [
    {
      name: 'insolvency_risk_check',
      description: 'Verifică dacă o firmă din România este în insolvență, faliment sau concordat.',
      parameters: {
        type: 'OBJECT',
        properties: { cui: { type: 'STRING', description: 'CUI-ul companiei (ex: 14399840)' } },
        required: ['cui']
      }
    },
    {
      name: 'anaf_lookup',
      description: 'Află starea fiscală, TVA și RO e-Factura din baza de date ANAF.',
      parameters: {
        type: 'OBJECT',
        properties: { cui: { type: 'STRING' } },
        required: ['cui']
      }
    }
  ]
}];

const response = await ai.models.generateContent({
  model: 'gemini-2.5-pro',
  contents: 'Verifică riscul de insolvență pentru eMAG (CUI 14399840)',
  config: { tools: mcpRomaniaTools }
});`,
      language: 'typescript',
    },
    claude: {
      title: 'Anthropic Claude Desktop',
      subtitle: 'Adaugă gateway-ul în fișierul claude_desktop_config.json pe Windows sau macOS.',
      code: `{
  "mcpServers": {
    "mcpromania": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-fetch",
        "https://api.mcpromania.ro/mcp"
      ],
      "env": {
        "MCP_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}`,
      language: 'json',
    },
    cursor: {
      title: 'Cursor IDE',
      subtitle:
        'Configurează MCP România în setările Features > MCP Servers sau în .cursor/mcp.json.',
      code: `{
  "mcpServers": {
    "mcp-romania-gateway": {
      "url": "https://api.mcpromania.ro/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY_HERE"
      }
    }
  }
}`,
      language: 'json',
    },
    windsurf: {
      title: 'Windsurf (Codeium Cascade)',
      subtitle: 'Adaugă conexiunea în ~/.codeium/windsurf/mcp_config.json pentru asistență nativă.',
      code: `{
  "mcpServers": {
    "mcp-romania": {
      "serverUrl": "https://api.mcpromania.ro/mcp",
      "auth": {
        "type": "bearer",
        "token": "YOUR_API_KEY_HERE"
      }
    }
  }
}`,
      language: 'json',
    },
    n8n: {
      title: 'n8n & Automatizări Make / Zapier',
      subtitle: 'Folosește nodul MCP Tool sau un nod HTTP Request cu autentificare Bearer Token.',
      code: `// Nod n8n HTTP Request / AI Agent Tool
Method: GET
URL: https://api.mcpromania.ro/api/v1/insolvency/check/{{ $json.cui }}
Headers:
  Authorization: Bearer YOUR_API_KEY_HERE
  Accept: application/json

// Răspuns instantaneu cu cache SWR sub 50ms`,
      language: 'text',
    },
    langchain: {
      title: 'Python / CrewAI / LangChain',
      subtitle: 'Integrează uneltele în agenții tăi autonomi în mai puțin de 5 linii de cod.',
      code: `from langchain_community.agent_toolkits import create_retriever_tool
import requests

def check_romanian_company(cui: str) -> dict:
    """Verifică datele fiscale și riscul de insolvență din România."""
    headers = {"Authorization": "Bearer YOUR_API_KEY_HERE"}
    res = requests.get(f"https://api.mcpromania.ro/api/v1/insolvency/check/{cui}", headers=headers)
    return res.json()

# Gata de utilizare în orice agent LangChain sau CrewAI!`,
      language: 'python',
    },
  };

  return (
    <div className="app-container">
      {/* Background Atmosphere */}
      <div className="ambient-bg">
        <div className="grid-overlay" />
        <div className="glow-orb glow-blue" />
        <div className="glow-orb glow-yellow" />
        <div className="glow-orb glow-red" />
      </div>

      {/* Navigation */}
      <header className="navbar">
        <Link href="/" className="nav-brand">
          <Image
            src="/logo.png"
            alt="MCP Romania Logo"
            width={38}
            height={38}
            priority
            style={{ borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <span className="brand-text">MCP ROMÂNIA</span>
        </Link>

        <div className="status-pill">
          <span className="status-dot" />
          <span>Gateway Live (99.98% Uptime)</span>
        </div>

        <nav className="nav-links">
          <a href="#unelte" className="nav-link">
            Unelte Active (7)
          </a>
          <a href="#integrari" className="nav-link">
            Integrare AI
          </a>
          <a href="#preturi" className="nav-link">
            Prețuri
          </a>
          <a href="#arhitectura" className="nav-link">
            Arhitectură
          </a>
          <a href="#preturi" className="nav-cta">
            <span>Intră pe lista de așteptare</span>
            <span>→</span>
          </a>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="badge-tag">
          <span>🚀 Gateway Oficial Model Context Protocol România</span>
        </div>
        <h1 className="hero-title">
          Conectează Orice <span className="gradient-text">Inteligență Artificială</span> la Datele
          din România
        </h1>
        <p className="hero-subtitle">
          Gateway enterprise de mare viteză cu 7 unelte esențiale: verificări fiscale ANAF, risc de
          insolvență &amp; faliment BPI, dosare Portal Just, curs valutar BNR și validări de conturi
          bancare IBAN.
        </p>

        <div className="hero-actions">
          <a href="#unelte" className="btn-primary">
            Explorează Cele 7 Unelte
          </a>
          <a href="#preturi" className="btn-secondary">
            Intră pe lista de așteptare
          </a>
        </div>

        {/* AI Logos Selector Bar */}
        <p className="ai-bar-title">
          Compatibil Nativ Cu Cele Mai Populare Modele &amp; Aplicații AI
        </p>
        <div className="ai-logos-grid" id="integrari">
          <button
            type="button"
            className={`ai-badge ${activeAITab === 'openai' ? 'active' : ''}`}
            onClick={() => setActiveAITab('openai')}
          >
            <span className="ai-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4947zm-9.66-4.5245a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1402-2.0455zm-1.0837-9.423a4.466 4.466 0 0 1 2.346-1.9729v5.63l4.7783 2.763a.79.79 0 0 0 .7806 0l5.8428-3.3732-2.02-1.1683a.0757.0757 0 0 1-.038-.052v-5.5826a4.504 4.504 0 0 1 4.4945-4.4947c1.3722 0 2.6166.6152 3.4735 1.5852l-.142.0805-4.783 2.7582a.7712.7712 0 0 0-.7806 0L8.271 11.2338v-2.3324a.0804.0804 0 0 1 .0332-.0615l4.8967-2.8277a4.4992 4.4992 0 0 1 6.1402 2.0455z" />
              </svg>
            </span>
            <span>OpenAI / ChatGPT</span>
          </button>

          <button
            type="button"
            className={`ai-badge ${activeAITab === 'gemini' ? 'active' : ''}`}
            onClick={() => setActiveAITab('gemini')}
          >
            <span className="ai-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
              </svg>
            </span>
            <span>Google Gemini</span>
          </button>

          <button
            type="button"
            className={`ai-badge ${activeAITab === 'claude' ? 'active' : ''}`}
            onClick={() => setActiveAITab('claude')}
          >
            <span className="ai-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm0-8h-2V7h2v2zm4 8h-2v-4h2v4zm0-6h-2V7h2v4z" />
              </svg>
            </span>
            <span>Anthropic Claude</span>
          </button>

          <button
            type="button"
            className={`ai-badge ${activeAITab === 'cursor' ? 'active' : ''}`}
            onClick={() => setActiveAITab('cursor')}
          >
            <span className="ai-icon">⚡</span>
            <span>Cursor IDE</span>
          </button>

          <button
            type="button"
            className={`ai-badge ${activeAITab === 'windsurf' ? 'active' : ''}`}
            onClick={() => setActiveAITab('windsurf')}
          >
            <span className="ai-icon">🏄</span>
            <span>Windsurf</span>
          </button>

          <button
            type="button"
            className={`ai-badge ${activeAITab === 'n8n' ? 'active' : ''}`}
            onClick={() => setActiveAITab('n8n')}
          >
            <span className="ai-icon">⚙️</span>
            <span>n8n / Make</span>
          </button>

          <button
            type="button"
            className={`ai-badge ${activeAITab === 'langchain' ? 'active' : ''}`}
            onClick={() => setActiveAITab('langchain')}
          >
            <span className="ai-icon">🐍</span>
            <span>Python / CrewAI</span>
          </button>
        </div>

        {/* Quick Connect Code Card */}
        <div className="quick-connect-card">
          <div className="connect-header">
            <div>
              <h3
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: '#f8fafc',
                  marginBottom: '0.2rem',
                }}
              >
                {aiConfigs[activeAITab].title}
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                {aiConfigs[activeAITab].subtitle}
              </p>
            </div>
            <button
              type="button"
              className="copy-btn"
              onClick={() => handleCopyCode(aiConfigs[activeAITab].code)}
            >
              <span>{isCopied ? '✓' : '📋'}</span>
              <span>{isCopied ? 'Copiat!' : 'Copiază Configurația'}</span>
            </button>
          </div>

          <pre className="code-box">
            <code>{aiConfigs[activeAITab].code}</code>
          </pre>
        </div>
      </section>

      {/* 7 Official Tools Information Showcase (Clean, Read-Only, No Mock Testing) */}
      <section className="tools-catalog-section" id="unelte">
        <div className="section-head">
          <div className="badge-tag">
            <span>🏛️ Catalog Oficial Unelte România</span>
          </div>
          <h2 className="section-title">Cele 7 Unelte Specializate</h2>
          <p className="section-subtitle">
            Conectori securizați de mare viteză prin Model Context Protocol (MCP) și REST API către
            principalele baze de date publice, juridice și financiare din România.
          </p>
        </div>

        <div className="tools-grid">
          {TOOLS_CATALOG.map((tool) => (
            <div key={tool.key} className="tool-info-card">
              <div className="card-top">
                <div className="tool-header-main">
                  <span className="tool-badge-icon">{tool.badge}</span>
                  <div>
                    <h3 className="tool-title">{tool.name}</h3>
                    <span className="category-pill">{tool.category}</span>
                  </div>
                </div>
                <div className="source-tag">{tool.source}</div>
              </div>

              <p className="tool-desc">{tool.description}</p>

              <div className="tool-capabilities">
                <div className="cap-label">Ce date furnizează:</div>
                <ul className="cap-list">
                  {tool.capabilities.map((cap, idx) => (
                    <li key={idx} className="cap-item">
                      <span className="cap-icon">✓</span>
                      <span>{cap}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card-footer-info">
                <div className="endpoint-row">
                  <span className="endpoint-badge">{tool.endpoint}</span>
                  <span className="mcp-pill">MCP Tool: {tool.mcpTool}</span>
                </div>
                <div className="param-hint">
                  <span className="param-label">Parametru:</span> {tool.paramFormat}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing / Developer Tiers (Immediate Value & Waitlist) */}
      <section className="pricing-section" id="preturi">
        <div className="section-head">
          <div className="badge-tag">
            <span>💎 Planuri Flexibile</span>
          </div>
          <h2 className="section-title">Transparent &amp; Scalabil</h2>
          <p className="section-subtitle">
            Începe gratuit și scalează pe măsură ce agenții tăi autonomi cresc în volum. Înscrie-te
            pe lista de așteptare pentru acces prioritar.
          </p>
        </div>

        <div className="pricing-grid">
          {/* Plan 1: Free */}
          <div className="pricing-card">
            <div className="tier-name">Free</div>
            <p className="tier-subtitle">Pentru testare, evaluare &amp; sandbox</p>
            <div className="tier-price">
              0 RON <span className="tier-period">/ lună</span>
            </div>
            <ul className="tier-features">
              <li>100 apeluri / lună incluse</li>
              <li>Rate limit: max 60 cereri / minut</li>
              <li>Acces la toate cele 7 unelte oficiale</li>
              <li>Compatibil OpenAI, Gemini, Claude, Cursor &amp; n8n</li>
              <li>Documentație completă &amp; schemă OpenAPI</li>
            </ul>
            <a
              href="mailto:waitlist@mcpromania.ro?subject=Inscriere%20Waitlist%20-%20Free%20Plan"
              className="btn-secondary"
              style={{ textAlign: 'center' }}
            >
              Intră pe lista de așteptare
            </a>
          </div>

          {/* Plan 2: Pro (Recomandat) */}
          <div className="pricing-card featured">
            <div className="pricing-badge">Recomandat</div>
            <div className="tier-name">Pro</div>
            <p className="tier-subtitle">Suficient pentru contabil individual (50–80 clienți)</p>
            <div className="tier-price">
              150 RON <span className="tier-period">/ lună</span>
            </div>
            <ul className="tier-features">
              <li>5.000 apeluri / lună incluse</li>
              <li>Rate limit: max 300 cereri / minut</li>
              <li>Cheie API privată de producție</li>
              <li>Prioritate în cache-ul SWR Redis (&lt; 50ms)</li>
              <li>Garanție de disponibilitate SLA 99.95%</li>
              <li>Suport dedicat pe email &amp; Discord</li>
            </ul>
            <a
              href="mailto:waitlist@mcpromania.ro?subject=Inscriere%20Waitlist%20-%20Pro%20Plan%20(150%20RON)"
              className="btn-primary"
              style={{ textAlign: 'center' }}
            >
              Intră pe lista de așteptare (Pro)
            </a>
          </div>

          {/* Plan 3: Agency */}
          <div className="pricing-card">
            <div className="tier-name">Agency</div>
            <p className="tier-subtitle">Bun pentru firmă mică (3–5 contabili)</p>
            <div className="tier-price">
              420 RON <span className="tier-period">/ lună</span>
            </div>
            <ul className="tier-features">
              <li>15.000 apeluri / lună incluse</li>
              <li>Rate limit extins: 1.000 cereri / minut</li>
              <li>Până la 5 chei API pentru echipă</li>
              <li>Monitorizare consum &amp; analitice detaliate</li>
              <li>Prioritate maximă în cozi de procesare</li>
              <li>Suport prioritar 24/7</li>
            </ul>
            <a
              href="mailto:waitlist@mcpromania.ro?subject=Inscriere%20Waitlist%20-%20Agency%20Plan%20(420%20RON)"
              className="btn-secondary"
              style={{ textAlign: 'center' }}
            >
              Intră pe lista de așteptare (Agency)
            </a>
          </div>

          {/* Plan 4: Custom */}
          <div className="pricing-card">
            <div className="tier-name">Custom</div>
            <p className="tier-subtitle">Volume mari, integratori ERP &amp; automatizări</p>
            <div className="tier-price">
              790 RON <span className="tier-period">/ lună</span>
            </div>
            <ul className="tier-features">
              <li>30.000 apeluri / lună incluse</li>
              <li>Fără limite restrictive de throughput</li>
              <li>Instanță dedicată On-Premise sau VPS privat</li>
              <li>Audit logs detaliate &amp; acord SLA 99.99%</li>
              <li>Manager tehnic dedicat &amp; onboarding direct</li>
            </ul>
            <a
              href="mailto:contact@mcpromania.ro?subject=Solicitare%20Plan%20Custom%20(790%20RON)%20MCP%20Romania"
              className="btn-secondary"
              style={{ textAlign: 'center' }}
            >
              Contactează-ne (Custom)
            </a>
          </div>
        </div>
      </section>

      {/* Enterprise Architecture Features (Deep-Dive) */}
      <section className="features-section" id="arhitectura">
        <div className="section-head">
          <div className="badge-tag">
            <span>🛡️ Infrastructură De Înaltă Disponibilitate</span>
          </div>
          <h2 className="section-title">Construit Pentru Trafic Enterprise</h2>
          <p className="section-subtitle">
            Sistemele guvernamentale pot fi lente sau instabile. Gateway-ul MCP România garantează
            stabilitate de 99.98% prin caching inteligent și protecții avansate.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-box">⚡</div>
            <h3>Stale-While-Revalidate (SWR) Redis</h3>
            <p>
              Răspunsuri instantanee sub 50ms pentru interogări frecvente. Datele sunt menținute
              proaspete în fundal fără a bloca apelurile agenților AI.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-box">🛡️</div>
            <h3>Circuit Breakers pe Serviciile Publice</h3>
            <p>
              Dacă serverele ANAF sau Portal Just întâmpină întreruperi temporare, gateway-ul comută
              automat pe fallback-ul de siguranță, evitând erorile în cascadă.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-box">⚖️</div>
            <h3>Disambiguare Debitor vs. Creditor</h3>
            <p>
              Filtrare juridică avansată care distinge companiile solvabile (care recuperează
              datorii ca creditori) de cele aflate efectiv în faliment ca debitoare.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-box">🔐</div>
            <h3>Cloudflare Anycast &amp; WAF Shield</h3>
            <p>
              Securitate de nivel bancar, filtrare automată DDoS, SSL TLS 1.3 și izolare completă
              multi-tenant pentru cheile API ale clienților.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-box">🔄</div>
            <h3>Replicare Gateway Duală</h3>
            <p>
              Instanțe redundante active-active cu load balancing Caddy intern pe VPS, asigurând
              disponibilitate permanentă la actualizări.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-box">📦</div>
            <h3>Standard Deschis Model Context Protocol</h3>
            <p>
              Compatibilitate totală cu specificația oficială Anthropic / Linux Foundation MCP.
              Conectează orice client fără modificări de cod.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-nav">
          <Link href="/politica-confidentialitate">Politica de Confidențialitate</Link>
          <span>•</span>
          <Link href="/termeni-conditii">Termeni și Condiții</Link>
          <span>•</span>
          <a
            href="https://github.com/zamsaalbertdaniel/mcpromania"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <span>•</span>
          <a href="mailto:contact@mcpromania.ro">Contact</a>
        </div>
        <p>
          © {new Date().getFullYear()} MCP România. Toate drepturile rezervate. Gateway neafiliat
          guvernamental.
        </p>
      </footer>
    </div>
  );
}
