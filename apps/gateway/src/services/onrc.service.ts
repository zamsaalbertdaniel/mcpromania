import {
  isValidRomanianCui,
  normalizeCui,
  type OnrcCompanyProfile,
  type OnrcCounty,
  type OnrcEntityType,
  type OnrcRegistration,
} from '@mcpromania/types';

import { AppError } from '../core/errors.js';

import type { AnafService } from './anaf.service.js';

export interface OnrcService {
  validateRegCom(input: string): OnrcRegistration;
  lookupCompany(cui: string): Promise<OnrcCompanyProfile>;
}

export const ONRC_COUNTIES: Record<
  string,
  {
    name: string;
    region: string;
    orctOffice: string;
    competentCourt: string;
    courtCodeJust: string;
  }
> = {
  '01': {
    name: 'Alba',
    region: 'Centru',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Alba',
    competentCourt: 'Tribunalul Alba',
    courtCodeJust: 'TribunalulALBA',
  },
  '02': {
    name: 'Arad',
    region: 'Vest',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Arad',
    competentCourt: 'Tribunalul Arad',
    courtCodeJust: 'TribunalulARAD',
  },
  '03': {
    name: 'Argeș',
    region: 'Sud-Muntenia',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Specializat Argeș',
    competentCourt: 'Tribunalul Specializat Argeș',
    courtCodeJust: 'TribunalulSpecializatARGES',
  },
  '04': {
    name: 'Bacău',
    region: 'Nord-Est',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Bacău',
    competentCourt: 'Tribunalul Bacău',
    courtCodeJust: 'TribunalulBACAU',
  },
  '05': {
    name: 'Bihor',
    region: 'Nord-Vest',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Bihor',
    competentCourt: 'Tribunalul Bihor',
    courtCodeJust: 'TribunalulBIHOR',
  },
  '06': {
    name: 'Bistrița-Năsăud',
    region: 'Nord-Vest',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Bistrița-Năsăud',
    competentCourt: 'Tribunalul Bistrița-Năsăud',
    courtCodeJust: 'TribunalulBISTRITANASAUD',
  },
  '07': {
    name: 'Botoșani',
    region: 'Nord-Est',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Botoșani',
    competentCourt: 'Tribunalul Botoșani',
    courtCodeJust: 'TribunalulBOTOSANI',
  },
  '08': {
    name: 'Brașov',
    region: 'Centru',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Brașov',
    competentCourt: 'Tribunalul Brașov',
    courtCodeJust: 'TribunalulBRASOV',
  },
  '09': {
    name: 'Brăila',
    region: 'Sud-Est',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Brăila',
    competentCourt: 'Tribunalul Brăila',
    courtCodeJust: 'TribunalulBRAILA',
  },
  '10': {
    name: 'Buzău',
    region: 'Sud-Est',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Buzău',
    competentCourt: 'Tribunalul Buzău',
    courtCodeJust: 'TribunalulBUZAU',
  },
  '11': {
    name: 'Caraș-Severin',
    region: 'Vest',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Caraș-Severin',
    competentCourt: 'Tribunalul Caraș-Severin',
    courtCodeJust: 'TribunalulCARASSEVERIN',
  },
  '12': {
    name: 'Cluj',
    region: 'Nord-Vest',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Specializat Cluj',
    competentCourt: 'Tribunalul Specializat Cluj',
    courtCodeJust: 'TribunalulSpecializatCLUJ',
  },
  '13': {
    name: 'Constanța',
    region: 'Sud-Est',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Constanța',
    competentCourt: 'Tribunalul Constanța',
    courtCodeJust: 'TribunalulCONSTANTA',
  },
  '14': {
    name: 'Covasna',
    region: 'Centru',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Covasna',
    competentCourt: 'Tribunalul Covasna',
    courtCodeJust: 'TribunalulCOVASNA',
  },
  '15': {
    name: 'Dâmbovița',
    region: 'Sud-Muntenia',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Dâmbovița',
    competentCourt: 'Tribunalul Dâmbovița',
    courtCodeJust: 'TribunalulDAMBOVITA',
  },
  '16': {
    name: 'Dolj',
    region: 'Sud-Vest Oltenia',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Dolj',
    competentCourt: 'Tribunalul Dolj',
    courtCodeJust: 'TribunalulDOLJ',
  },
  '17': {
    name: 'Galați',
    region: 'Sud-Est',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Galați',
    competentCourt: 'Tribunalul Galați',
    courtCodeJust: 'TribunalulGALATI',
  },
  '18': {
    name: 'Gorj',
    region: 'Sud-Vest Oltenia',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Gorj',
    competentCourt: 'Tribunalul Gorj',
    courtCodeJust: 'TribunalulGORJ',
  },
  '19': {
    name: 'Harghita',
    region: 'Centru',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Harghita',
    competentCourt: 'Tribunalul Harghita',
    courtCodeJust: 'TribunalulHARGHITA',
  },
  '20': {
    name: 'Hunedoara',
    region: 'Vest',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Hunedoara',
    competentCourt: 'Tribunalul Hunedoara',
    courtCodeJust: 'TribunalulHUNEDOARA',
  },
  '21': {
    name: 'Ialomița',
    region: 'Sud-Muntenia',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Ialomița',
    competentCourt: 'Tribunalul Ialomița',
    courtCodeJust: 'TribunalulIALOMITA',
  },
  '22': {
    name: 'Iași',
    region: 'Nord-Est',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Iași',
    competentCourt: 'Tribunalul Iași',
    courtCodeJust: 'TribunalulIASI',
  },
  '23': {
    name: 'Ilfov',
    region: 'București-Ilfov',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Ilfov',
    competentCourt: 'Tribunalul Ilfov',
    courtCodeJust: 'TribunalulILFOV',
  },
  '24': {
    name: 'Maramureș',
    region: 'Nord-Vest',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Maramureș',
    competentCourt: 'Tribunalul Maramureș',
    courtCodeJust: 'TribunalulMARAMURES',
  },
  '25': {
    name: 'Mehedinți',
    region: 'Sud-Vest Oltenia',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Mehedinți',
    competentCourt: 'Tribunalul Mehedinți',
    courtCodeJust: 'TribunalulMEHEDINTI',
  },
  '26': {
    name: 'Mureș',
    region: 'Centru',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Specializat Mureș',
    competentCourt: 'Tribunalul Specializat Mureș',
    courtCodeJust: 'TribunalulSpecializatMURES',
  },
  '27': {
    name: 'Neamț',
    region: 'Nord-Est',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Neamț',
    competentCourt: 'Tribunalul Neamț',
    courtCodeJust: 'TribunalulNEAMT',
  },
  '28': {
    name: 'Olt',
    region: 'Sud-Vest Oltenia',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Olt',
    competentCourt: 'Tribunalul Olt',
    courtCodeJust: 'TribunalulOLT',
  },
  '29': {
    name: 'Prahova',
    region: 'Sud-Muntenia',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Prahova',
    competentCourt: 'Tribunalul Prahova',
    courtCodeJust: 'TribunalulPRAHOVA',
  },
  '30': {
    name: 'Satu Mare',
    region: 'Nord-Vest',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Satu Mare',
    competentCourt: 'Tribunalul Satu Mare',
    courtCodeJust: 'TribunalulSATUMARE',
  },
  '31': {
    name: 'Sălaj',
    region: 'Nord-Vest',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Sălaj',
    competentCourt: 'Tribunalul Sălaj',
    courtCodeJust: 'TribunalulSALAJ',
  },
  '32': {
    name: 'Sibiu',
    region: 'Centru',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Sibiu',
    competentCourt: 'Tribunalul Sibiu',
    courtCodeJust: 'TribunalulSIBIU',
  },
  '33': {
    name: 'Suceava',
    region: 'Nord-Est',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Suceava',
    competentCourt: 'Tribunalul Suceava',
    courtCodeJust: 'TribunalulSUCEAVA',
  },
  '34': {
    name: 'Teleorman',
    region: 'Sud-Muntenia',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Teleorman',
    competentCourt: 'Tribunalul Teleorman',
    courtCodeJust: 'TribunalulTELEORMAN',
  },
  '35': {
    name: 'Timiș',
    region: 'Vest',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Timiș',
    competentCourt: 'Tribunalul Timiș',
    courtCodeJust: 'TribunalulTIMIS',
  },
  '36': {
    name: 'Tulcea',
    region: 'Sud-Est',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Tulcea',
    competentCourt: 'Tribunalul Tulcea',
    courtCodeJust: 'TribunalulTULCEA',
  },
  '37': {
    name: 'Vaslui',
    region: 'Nord-Est',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Vaslui',
    competentCourt: 'Tribunalul Vaslui',
    courtCodeJust: 'TribunalulVASLUI',
  },
  '38': {
    name: 'Vâlcea',
    region: 'Sud-Vest Oltenia',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Vâlcea',
    competentCourt: 'Tribunalul Vâlcea',
    courtCodeJust: 'TribunalulVALCEA',
  },
  '39': {
    name: 'Vrancea',
    region: 'Sud-Est',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Vrancea',
    competentCourt: 'Tribunalul Vrancea',
    courtCodeJust: 'TribunalulVRANCEA',
  },
  '40': {
    name: 'București',
    region: 'București-Ilfov',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul București',
    competentCourt: 'Tribunalul București',
    courtCodeJust: 'TribunalulBUCURESTI',
  },
  '51': {
    name: 'Călărași',
    region: 'Sud-Muntenia',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Călărași',
    competentCourt: 'Tribunalul Călărași',
    courtCodeJust: 'TribunalulCALARASI',
  },
  '52': {
    name: 'Giurgiu',
    region: 'Sud-Muntenia',
    orctOffice: 'Oficiul Registrului Comerțului de pe lângă Tribunalul Giurgiu',
    competentCourt: 'Tribunalul Giurgiu',
    courtCodeJust: 'TribunalulGIURGIU',
  },
};

const ENTITY_TYPES: Record<string, OnrcEntityType> = {
  J: {
    code: 'J',
    name: 'Persoană Juridică (Societate Comercială: SRL, SA, SNC, SCS, SCA / Companie Națională / Regie Autonomă / Sucursală)',
    category: 'juridica',
  },
  F: {
    code: 'F',
    name: 'Persoană Fizică (PFA - Persoană Fizică Autorizată / II - Întreprindere Individuală / IF - Întreprindere Familială)',
    category: 'fizica',
  },
  C: {
    code: 'C',
    name: 'Societate Cooperativă (Cooperație meșteșugărească, de consum sau de credit)',
    category: 'cooperativa',
  },
};

export function createOnrcService(deps: { anaf: AnafService }): OnrcService {
  return {
    validateRegCom(input: string): OnrcRegistration {
      const raw = (input || '').trim();
      if (!raw) {
        return {
          raw: '',
          formatted: null,
          isValid: false,
          entityType: null,
          county: null,
          serialNumber: null,
          year: null,
          validationError: 'Numărul de Registru al Comerțului este gol',
        };
      }

      let letter: 'J' | 'F' | 'C' | null = null;
      let countyCode: string | null = null;
      let serialNumber: number | null = null;
      let year: number | null = null;

      // 1. Format canonic cu delimitatori: [JFC] jj / nnnn / aaaa (sau aa) (ex: J40/1234/2024, J12/4155/93)
      const slashPattern = new RegExp(
        '^([JFCjfc])\\s*([0-9]{1,2})[\\s/.-]+([0-9]{1,8})[\\s/.-]+([0-9]{2,4})$'
      );
      const slashMatch = slashPattern.exec(raw);

      // 2. Format compact ANAF / EUID: [JFC] + AAAA + NNNNNN + JJ + [C] (ex: J2002000372404)
      const compactEuidPattern = new RegExp('^([JFCjfc])([0-9]{4})([0-9]{6})([0-9]{2})([0-9]?)$');
      const compactMatch = compactEuidPattern.exec(raw);

      if (slashMatch) {
        letter = slashMatch[1]!.toUpperCase() as 'J' | 'F' | 'C';
        countyCode = slashMatch[2]!.padStart(2, '0');
        serialNumber = Number.parseInt(slashMatch[3]!, 10);
        let parsedYear = Number.parseInt(slashMatch[4]!, 10);
        if (parsedYear < 100) {
          parsedYear = parsedYear >= 90 ? 1900 + parsedYear : 2000 + parsedYear;
        }
        year = parsedYear;
      } else if (compactMatch) {
        letter = compactMatch[1]!.toUpperCase() as 'J' | 'F' | 'C';
        year = Number.parseInt(compactMatch[2]!, 10);
        serialNumber = Number.parseInt(compactMatch[3]!, 10);
        countyCode = compactMatch[4]!;
      } else {
        return {
          raw,
          formatted: null,
          isValid: false,
          entityType: null,
          county: null,
          serialNumber: null,
          year: null,
          validationError:
            'Format invalid. Formatele recunoscute sunt [J|F|C]jj/nnnn/aaaa (ex: J40/1234/2024) sau formatul compact ANAF (ex: J2002000372404)',
        };
      }

      const entityType = ENTITY_TYPES[letter] ?? null;
      const countyData = ONRC_COUNTIES[countyCode];

      if (!countyData) {
        return {
          raw,
          formatted: null,
          isValid: false,
          entityType,
          county: null,
          serialNumber: null,
          year: null,
          validationError: `Cod județean ONRC necunoscut: ${countyCode}`,
        };
      }

      const county: OnrcCounty = {
        code: countyCode,
        name: countyData.name,
        region: countyData.region,
        orctOffice: countyData.orctOffice,
        competentCourt: countyData.competentCourt,
        courtCodeJust: countyData.courtCodeJust,
      };

      const currentYear = new Date().getFullYear();
      if (year < 1990 || year > currentYear + 1) {
        return {
          raw,
          formatted: null,
          isValid: false,
          entityType,
          county,
          serialNumber,
          year,
          validationError: `Anul înmatriculării (${year}) este în afara intervalului valid (1990 - ${currentYear + 1})`,
        };
      }

      const formatted = `${letter}${countyCode}/${serialNumber}/${year}`;

      return {
        raw,
        formatted,
        isValid: true,
        entityType,
        county,
        serialNumber,
        year,
        validationError: null,
      };
    },

    async lookupCompany(cui: string): Promise<OnrcCompanyProfile> {
      const clean = normalizeCui(cui);
      if (!clean || !isValidRomanianCui(clean)) {
        throw new AppError(400, 'BAD_REQUEST', 'CUI-ul specificat este invalid');
      }

      const hit = await deps.anaf.lookup(clean);
      const company = hit.data;

      const onrc = this.validateRegCom(company.nrRegCom || '');
      const currentYear = new Date().getFullYear();
      const ageYears = onrc.year ? Math.max(0, currentYear - onrc.year) : null;

      return {
        cui: clean,
        name: company.denumire,
        address: company.adresa,
        onrc,
        status: {
          isActive:
            !company.statusInactiv &&
            !(company.stareInregistrare?.toUpperCase().includes('RADIAT') ?? false),
          isInactiveFiscal: company.statusInactiv,
          isVatPayer: company.scpTva,
          vatSplit: company.statusSplitTva,
        },
        registrationDate: company.dataInregistrare,
        ageYears,
      };
    },
  };
}
