'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

type AITab = 'openai' | 'gemini' | 'claude' | 'cursor' | 'windsurf' | 'n8n' | 'langchain';
type ToolKey =
  | 'anaf_lookup'
  | 'insolvency_risk_check'
  | 'portal_just_search'
  | 'bnr_exchange_rate'
  | 'iban_validate'
  | 'onrc_validate_regcom'
  | 'onrc_company_lookup';

interface ToolDef {
  key: ToolKey;
  name: string;
  badge: string;
  category: string;
  description: string;
  defaultParam: string;
  paramLabel: string;
  examples: { label: string; value: string }[];
  mockResult: (val: string) => Record<string, unknown>;
}

const TOOLS: Record<ToolKey, ToolDef> = {
  insolvency_risk_check: {
    key: 'insolvency_risk_check',
    name: 'Insolvență & BPI Just',
    badge: '⚖️',
    category: 'Risc & Conformitate',
    description:
      'Verifică dacă o firmă se află în insolvență, faliment sau concordat în Buletinul Procedurilor de Insolvență și instanțe.',
    defaultParam: '14399840',
    paramLabel: 'CUI sau Denumire Companie',
    examples: [
      { label: 'eMAG (Dante Int.)', value: '14399840' },
      { label: 'Dedeman SRL', value: '2816464' },
      { label: 'Dosar Faliment Cluj', value: '340/1285/2026' },
    ],
    mockResult: (val) => {
      const isClean =
        val.includes('14399840') || val.includes('2816464') || val.toLowerCase().includes('dante');
      if (isClean) {
        return {
          ok: true,
          data: {
            cui: val,
            name: val.includes('14399840') ? 'DANTE INTERNATIONAL SA' : 'DEDEMAN SRL',
            status: 'IN_BONIS',
            hasInsolvencyRisk: false,
            riskLevel: 'LOW',
            summary:
              'Compania este activă (IN BONIS). Nu figurează ca debitoare în dosare de insolvență sau faliment.',
            totalCases: 0,
            cases: [],
            creditorMentionsNotice:
              'Compania figurează exclusiv ca parte creditoare care recuperează creanțe de la terți debitori.',
          },
        };
      }
      return {
        ok: true,
        data: {
          cui: val,
          name: 'SOCIETATE SUB INCIDENTA LEGII 85/2014',
          status: 'FALIMENT',
          hasInsolvencyRisk: true,
          riskLevel: 'CRITICAL',
          summary:
            'Atenție: Compania se află în procedură de FALIMENT conform dosarului judiciar înregistrat la Tribunal.',
          totalCases: 1,
          cases: [
            {
              caseNumber: '340/1285/2026',
              court: 'TribunalulComercialCLUJ',
              department: 'Secția Faliment',
              filingDate: '2026-02-14T09:00:00',
              status: 'FALIMENT',
              stage: 'Fond',
              judicialAdministrator: 'CONSORTIUL DE PRACTICIENI IN INSOLVENTA SPRL',
            },
          ],
        },
      };
    },
  },
  anaf_lookup: {
    key: 'anaf_lookup',
    name: 'ANAF Info & TVA',
    badge: '🏛️',
    category: 'Fiscalitate',
    description:
      'Interogare oficială ANAF în timp real: stare de funcționare, plătitor TVA, Split TVA și înregistrare RO e-Factura.',
    defaultParam: '14399840',
    paramLabel: 'Cod Unic de Înregistrare (CUI / CIF)',
    examples: [
      { label: 'eMAG (14399840)', value: '14399840' },
      { label: 'Dedeman (2816464)', value: '2816464' },
      { label: 'MCP România', value: 'RO43326553' },
    ],
    mockResult: (val) => ({
      ok: true,
      data: {
        cui: val.replace(/\D/g, '') || '14399840',
        denumire: val.includes('2816464') ? 'DEDEMAN S.R.L.' : 'DANTE INTERNATIONAL S.A.',
        adresa: val.includes('2816464')
          ? 'Mun. Bacău, Str. Alexei Tolstoi nr. 8'
          : 'Mun. București, Șos. Virtuții nr. 148',
        stare: 'ACTIV',
        platitorTva: true,
        tvaLaIncasare: false,
        splitTVA: false,
        statusROeFactura: true,
        dataActualizare: new Date().toISOString().split('T')[0],
      },
    }),
  },
  portal_just_search: {
    key: 'portal_just_search',
    name: 'Portal Just Dosare',
    badge: '📜',
    category: 'Juridic & Instanțe',
    description:
      'Căutare automată de jurisprudență și dosare pe portal.just.ro pentru orice persoană juridică sau fizică.',
    defaultParam: '14399840',
    paramLabel: 'CUI, Denumire sau Număr Dosar',
    examples: [
      { label: 'DANTE INTERNATIONAL', value: 'DANTE INTERNATIONAL' },
      { label: 'Dosar 19/122/2018', value: '19/122/2018' },
    ],
    mockResult: (val) => ({
      ok: true,
      query: val,
      resultsCount: 2,
      cases: [
        {
          numarDosar: '1240/3/2026',
          institutie: 'TribunalulBUCURESTI',
          sectie: 'Secția a VI-a Civilă',
          obiect: 'pretentii comerciale',
          stadiuProcesual: 'Fond',
          data: '2026-03-10',
          parti: [
            { nume: 'DANTE INTERNATIONAL SA', calitate: 'Reclamant' },
            { nume: 'LOGISTICS PARK SRL', calitate: 'Pârât' },
          ],
        },
      ],
    }),
  },
  bnr_exchange_rate: {
    key: 'bnr_exchange_rate',
    name: 'Curs Valutar BNR',
    badge: '💶',
    category: 'Financiar',
    description:
      'Cursurile valutare oficiale publicate zilnic de Banca Națională a României (BNR) cu suport pentru cotații istorice.',
    defaultParam: 'EUR',
    paramLabel: 'Cod Valută (EUR, USD, GBP, CHF)',
    examples: [
      { label: 'Euro (EUR)', value: 'EUR' },
      { label: 'Dolar SUA (USD)', value: 'USD' },
      { label: 'Liră Sterlină (GBP)', value: 'GBP' },
      { label: 'Franc Elvețian (CHF)', value: 'CHF' },
    ],
    mockResult: (val) => {
      const v = (val || 'EUR').toUpperCase();
      const rates: Record<string, number> = { EUR: 4.9765, USD: 4.6231, GBP: 5.8912, CHF: 5.214 };
      return {
        ok: true,
        moneda: v,
        valoareRON: rates[v] || 4.9765,
        dataEmitere: new Date().toISOString().split('T')[0],
        bancaEmitenta: 'Banca Națională a României',
        variatieZiPrecedenta: '+0.0012 RON',
      };
    },
  },
  iban_validate: {
    key: 'iban_validate',
    name: 'Validare IBAN RO',
    badge: '💳',
    category: 'Financiar & Plăți',
    description:
      'Validare matematică conform standardului ISO 13616 (MOD97), identificare cod BIC bancar și sucursală din România.',
    defaultParam: 'RO49INGB0000999901234567',
    paramLabel: 'Cont IBAN Românesc (24 caractere)',
    examples: [
      { label: 'ING Bank', value: 'RO49INGB0000999901234567' },
      { label: 'Banca Transilvania', value: 'RO98BTRL0000000000000000' },
      { label: 'IBAN Nevalid', value: 'RO00FAKE0000000000000000' },
    ],
    mockResult: (val) => {
      const clean = val.replace(/\s+/g, '').toUpperCase();
      const isValid = clean.startsWith('RO') && clean.length === 24 && !clean.includes('FAKE');
      return {
        ok: true,
        iban: clean,
        isValid,
        tara: 'România (RO)',
        banca: isValid
          ? clean.includes('INGB')
            ? 'ING Bank N.V. Amsterdam'
            : 'Banca Transilvania S.A.'
          : 'Necunoscută',
        codBIC: isValid ? (clean.includes('INGB') ? 'INGBROBU' : 'BTRLRO22') : null,
        checksumValida: isValid,
        mesaj: isValid
          ? 'IBAN conform standardului internațional ISO 13616.'
          : 'Cifrele de control MOD97 sunt invalide.',
      };
    },
  },
  onrc_validate_regcom: {
    key: 'onrc_validate_regcom',
    name: 'Validare RegCom ONRC',
    badge: '🏢',
    category: 'Registrul Comerțului',
    description:
      'Validează structura legală a numărului de înregistrare ONRC (J/F/C, indicativ județ, număr ordine și an înființare).',
    defaultParam: 'J40/372/2002',
    paramLabel: 'Număr RegCom (Ex: J40/372/2002)',
    examples: [
      { label: 'Dante Int. (eMAG)', value: 'J40/372/2002' },
      { label: 'Dedeman', value: 'J04/137/1992' },
      { label: 'București 2024', value: 'J40/1234/2024' },
    ],
    mockResult: (val) => ({
      ok: true,
      rawInput: val,
      isValid: true,
      tipSocietate: 'J - Persoană Juridică (SRL / SA)',
      judet: val.includes('04') ? 'Bacău (BC)' : 'Municipiul București (B)',
      numarOrdine: 372,
      anInregistrare: 2002,
      formatStandard: val.toUpperCase(),
    }),
  },
  onrc_company_lookup: {
    key: 'onrc_company_lookup',
    name: 'Identificare ONRC',
    badge: '🔍',
    category: 'Registrul Comerțului',
    description:
      'Reconciliere automată între CUI fiscal, număr de înregistrare la Registrul Comerțului și sediul social.',
    defaultParam: '14399840',
    paramLabel: 'CUI sau Număr Înregistrare ONRC',
    examples: [
      { label: '14399840', value: '14399840' },
      { label: 'J40/372/2002', value: 'J40/372/2002' },
    ],
    mockResult: (val) => ({
      ok: true,
      cui: val.startsWith('J') ? '14399840' : val,
      nrRegCom: val.startsWith('J') ? val : 'J40/372/2002',
      euid: `ROONRC.${val.startsWith('J') ? val : 'J40/372/2002'}`,
      denumire: 'DANTE INTERNATIONAL S.A.',
      sediuSocial: 'București Sectorul 6, Șos. Virtuții 148',
      stareFirma: 'FUNCȚIUNE',
    }),
  },
};

export default function Home() {
  const [activeAITab, setActiveAITab] = useState<AITab>('openai');
  const [activeToolKey, setActiveToolKey] = useState<ToolKey>('insolvency_risk_check');
  const [paramInput, setParamInput] = useState<string>(TOOLS.insolvency_risk_check.defaultParam);
  const [outputView, setOutputView] = useState<'card' | 'json'>('card');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [latency] = useState<number>(48);

  const activeTool = TOOLS[activeToolKey];
  const currentResult = activeTool.mockResult(paramInput);

  const handleSelectTool = (key: ToolKey) => {
    setActiveToolKey(key);
    setParamInput(TOOLS[key].defaultParam);
  };

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
      subtitle: 'Importă schema OpenAPI direct în panoul GPT Builder de la OpenAI.',
      code: JSON.stringify(
        {
          openapi: '3.1.0',
          info: {
            title: 'MCP Romania API',
            version: '1.0.0',
            description:
              'Instrumente AI pentru accesul la datele publice din România (ANAF, Justiție, Insolvență, BNR, ONRC)',
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
            '/api/v1/anaf/lookup/{cui}': {
              get: {
                operationId: 'anaf_lookup',
                summary: 'Interogare stare fiscală, TVA și e-Factura',
                parameters: [
                  { name: 'cui', in: 'path', required: true, schema: { type: 'string' } },
                ],
              },
            },
            '/api/v1/bnr/rate/{currency}': {
              get: {
                operationId: 'bnr_exchange_rate',
                summary: 'Curs valutar oficial BNR',
                parameters: [
                  { name: 'currency', in: 'path', required: true, schema: { type: 'string' } },
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
        "https://api.mcpromania.ro/sse"
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
      "url": "https://api.mcpromania.ro/sse",
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
      "serverUrl": "https://api.mcpromania.ro/sse",
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
  Authorization: Bearer mcpr_live_secret123
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
    headers = {"Authorization": "Bearer YOUR_API_KEY"}
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
          <a href="#arhitectura" className="nav-link">
            Arhitectură
          </a>
          <a href="#preturi" className="nav-link">
            Prețuri
          </a>
          <a href="#unelte" className="nav-cta">
            <span>Testează Sandbox</span>
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
            Deschide Sandbox Interactiv
          </a>
          <a href="#integrari" className="btn-secondary">
            Ghid de Integrare AI
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

      {/* Interactive 7-Tool Live Sandbox */}
      <section className="sandbox-section" id="unelte">
        <div className="section-head">
          <div className="badge-tag">
            <span>✨ Testează în Timp Real</span>
          </div>
          <h2 className="section-title">Cele 7 Unelte Oficiale România</h2>
          <p className="section-subtitle">
            Alege o unealtă din meniu, selectează o companie sau un parametru demo și observă viteza
            și structura datelor returnate de gateway.
          </p>
        </div>

        <div className="sandbox-container">
          {/* Tools Sidebar */}
          <div className="tools-sidebar">
            {(Object.keys(TOOLS) as ToolKey[]).map((key) => {
              const item = TOOLS[key];
              const isSelected = item.key === activeToolKey;
              return (
                <button
                  type="button"
                  key={key}
                  className={`tool-selector-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => handleSelectTool(key)}
                >
                  <span className="tool-badge-icon">{item.badge}</span>
                  <div className="tool-meta">
                    <h4>{item.name}</h4>
                    <p>{item.category}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sandbox Workspace */}
          <div className="sandbox-workspace">
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                {activeTool.badge} {activeTool.name}
              </h3>
              <p style={{ fontSize: '0.88rem', color: '#94a3b8', marginBottom: '1.2rem' }}>
                {activeTool.description}
              </p>
            </div>

            {/* Parameter Input & Presets */}
            <div className="input-bar">
              <input
                type="text"
                className="param-input"
                placeholder={activeTool.paramLabel}
                value={paramInput}
                onChange={(e) => setParamInput(e.target.value)}
              />
              <button
                type="button"
                className="run-btn"
                onClick={() => {
                  /* trigger quick refresh feedback */
                }}
              >
                <span>Rulează Unealta</span>
                <span>▶</span>
              </button>
            </div>

            {/* Quick Presets */}
            <div className="quick-examples">
              <span className="examples-label">Exemple rapide:</span>
              {activeTool.examples.map((ex) => (
                <button
                  type="button"
                  key={ex.label}
                  className="example-chip"
                  onClick={() => setParamInput(ex.value)}
                >
                  {ex.label}
                </button>
              ))}
            </div>

            {/* Output Panel */}
            <div className="output-panel">
              <div className="output-header">
                <div className="execution-tag">
                  <span>Status: 200 OK</span>
                  <span>•</span>
                  <span className="latency-pill">⚡ {latency}ms (SWR Redis)</span>
                </div>
                <div className="view-toggle">
                  <button
                    type="button"
                    className={`toggle-btn ${outputView === 'card' ? 'active' : ''}`}
                    onClick={() => setOutputView('card')}
                  >
                    Card Vizual
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${outputView === 'json' ? 'active' : ''}`}
                    onClick={() => setOutputView('json')}
                  >
                    JSON Brut
                  </button>
                </div>
              </div>

              {outputView === 'card' ? (
                <div className="result-card">
                  {Object.entries(
                    currentResult.data
                      ? (currentResult.data as Record<string, unknown>)
                      : currentResult
                  ).map(([k, v]) => {
                    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                      return null;
                    }
                    const strVal = Array.isArray(v) ? `${v.length} elemente` : String(v);
                    const isStatus =
                      k.toLowerCase().includes('status') || k.toLowerCase().includes('stare');
                    return (
                      <div key={k} className="result-item">
                        <div className="result-label">{k}</div>
                        {isStatus ? (
                          <span
                            className={`status-badge ${strVal.toUpperCase() === 'IN_BONIS' || strVal.toUpperCase() === 'ACTIV' ? 'in-bonis' : 'faliment'}`}
                          >
                            {strVal}
                          </span>
                        ) : (
                          <div className="result-value">{strVal}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <pre
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    color: '#a7f3d0',
                  }}
                >
                  {JSON.stringify(currentResult, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Architecture Features */}
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

      {/* Pricing / Developer Tiers */}
      <section className="pricing-section" id="preturi">
        <div className="section-head">
          <div className="badge-tag">
            <span>💎 Planuri Flexibile</span>
          </div>
          <h2 className="section-title">Transparent &amp; Scalabil</h2>
          <p className="section-subtitle">
            Începe gratuit și scalează pe măsură ce agenții tăi autonomi cresc în volum.
          </p>
        </div>

        <div className="pricing-grid">
          <div className="pricing-card">
            <div className="tier-name">Free Developer</div>
            <div className="tier-price">
              0 RON <span className="tier-period">/ lună</span>
            </div>
            <ul className="tier-features">
              <li>Acces la toate cele 7 unelte oficiale</li>
              <li>Limită de 60 cereri / minut</li>
              <li>Integrare Claude Desktop, Cursor &amp; OpenAI</li>
              <li>Suport prin comunitate GitHub</li>
              <li>Documentație completă &amp; exemple</li>
            </ul>
            <a href="#unelte" className="btn-secondary" style={{ textAlign: 'center' }}>
              Începe Gratuit
            </a>
          </div>

          <div className="pricing-card featured">
            <div className="pricing-badge">Recomandat</div>
            <div className="tier-name">Pro Developer</div>
            <div className="tier-price">
              99 RON <span className="tier-period">/ lună</span>
            </div>
            <ul className="tier-features">
              <li>Până la 1.000 cereri / minut</li>
              <li>Cheie API privată de producție</li>
              <li>Prioritate înaltă în coada de cache Redis</li>
              <li>Garanție de răspuns SLA 99.95%</li>
              <li>Suport prioritar pe email &amp; Discord</li>
            </ul>
            <a
              href="mailto:contact@mcpromania.ro?subject=Upgrade%20Pro%20MCP%20Romania"
              className="btn-primary"
              style={{ textAlign: 'center' }}
            >
              Activează Pro
            </a>
          </div>

          <div className="pricing-card">
            <div className="tier-name">Enterprise</div>
            <div className="tier-price">
              Personalizat <span className="tier-period">/ proiect</span>
            </div>
            <ul className="tier-features">
              <li>Volum nelimitat de interogări</li>
              <li>Instanță dedicată On-Premise sau VPS privat</li>
              <li>Audit logs detaliate &amp; securitate custom</li>
              <li>Acord de nivel al serviciilor (SLA 99.99%)</li>
              <li>Manager tehnic dedicat &amp; asistență 24/7</li>
            </ul>
            <a
              href="mailto:contact@mcpromania.ro?subject=Solicitare%20Enterprise%20MCP%20Romania"
              className="btn-secondary"
              style={{ textAlign: 'center' }}
            >
              Contactează-ne
            </a>
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
