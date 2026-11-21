import type { IbanValidationResult } from '@mcpromania/types';

export interface BankInfo {
  name: string;
  bic: string;
  isTreasury?: boolean;
}

export const ROMANIAN_BANKS: Record<string, BankInfo> = {
  BTRL: { name: 'Banca Transilvania', bic: 'BTRLRO22' },
  BCRB: { name: 'Banca Comercială Română (BCR)', bic: 'RNCBROBU' },
  BRDE: { name: 'BRD - Groupe Société Générale', bic: 'BRDEROBU' },
  INGB: { name: 'ING Bank N.V. Amsterdam - Sucursala București', bic: 'INGBROBU' },
  RZBR: { name: 'Raiffeisen Bank România', bic: 'RZBRROBU' },
  CECE: { name: 'CEC Bank', bic: 'CECEROBU' },
  BACX: { name: 'UniCredit Bank', bic: 'BACXROBU' },
  UGBI: { name: 'UniCredit Bank', bic: 'BACXROBU' },
  TREZ: { name: 'Trezoreria Statului', bic: 'TREZROBU', isTreasury: true },
  PIRB: { name: 'First Bank (fost Piraeus Bank)', bic: 'PIRBROBU' },
  OTPV: { name: 'OTP Bank România', bic: 'OTPVROBU' },
  CITI: { name: 'Citibank Europe plc Dublin - Sucursala România', bic: 'CITIROBU' },
  BNPA: { name: 'BNP Paribas Fortis SA/NV - Sucursala București', bic: 'BNPAROBU' },
  LIBR: { name: 'Libra Internet Bank', bic: 'BRELROBU' },
  BREL: { name: 'Libra Internet Bank', bic: 'BRELROBU' },
  DARO: { name: 'Patria Bank', bic: 'CARPRO22' },
  CARP: { name: 'Patria Bank', bic: 'CARPRO22' },
  MIRO: { name: 'ProCredit Bank România', bic: 'PRCEROBU' },
  PRCE: { name: 'ProCredit Bank România', bic: 'PRCEROBU' },
  EXIM: { name: 'Exim Banca Românească', bic: 'EXIMROBU' },
  VBBN: { name: 'Vista Bank România', bic: 'VISTROBU' },
  VIST: { name: 'Vista Bank România', bic: 'VISTROBU' },
  ROIN: { name: 'Banca Română de Credite și Investiții (BRCI)', bic: 'ROINROBU' },
  TBIB: { name: 'TBI Bank EAD Sofia - Sucursala București', bic: 'TBIBROBU' },
  ALBP: { name: 'Alpha Bank România', bic: 'ALBPROBU' },
  GARB: { name: 'Garanti BBVA România', bic: 'UGBIROBU' },
  BINT: { name: 'Intesa Sanpaolo Bank România', bic: 'BINTROBU' },
  REVO: { name: 'Revolut Bank UAB - Sucursala România', bic: 'REVOROB1' },
  BPOS: { name: 'Bancpost (fuzionată cu Banca Transilvania)', bic: 'BPOSTROBU' },
};

export interface IbanService {
  validate(ibanInput: string): IbanValidationResult;
}

export function createIbanService(): IbanService {
  return {
    validate(ibanInput: string): IbanValidationResult {
      const clean = (ibanInput || '').trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '');

      // Formatting helper (chunks of 4)
      const formatIban = (str: string) => str.replace(/(.{4})/g, '$1 ').trim();
      const formatted = formatIban(clean);

      if (!clean) {
        return {
          iban: '',
          formatted: '',
          isValid: false,
          countryCode: '',
          isRomanian: false,
          bankCode: null,
          bankName: null,
          swiftBic: null,
          isTreasury: false,
          accountNumber: null,
          validationError: 'IBAN-ul nu poate fi gol',
        };
      }

      if (!/^[A-Z0-9]+$/.test(clean)) {
        return {
          iban: clean,
          formatted,
          isValid: false,
          countryCode: clean.slice(0, 2),
          isRomanian: clean.startsWith('RO'),
          bankCode: null,
          bankName: null,
          swiftBic: null,
          isTreasury: false,
          accountNumber: null,
          validationError:
            'IBAN-ul conține caractere nepermise (sunt permise doar litere și cifre)',
        };
      }

      const countryCode = clean.slice(0, 2);
      const isRomanian = countryCode === 'RO';

      // Romanian IBAN validation specifics
      if (isRomanian) {
        if (clean.length !== 24) {
          return {
            iban: clean,
            formatted,
            isValid: false,
            countryCode,
            isRomanian: true,
            bankCode: clean.length >= 8 ? clean.slice(4, 8) : null,
            bankName: null,
            swiftBic: null,
            isTreasury: false,
            accountNumber: null,
            validationError: `Lungime invalidă pentru un IBAN românesc: are ${clean.length} caractere (trebuie să aibă exact 24)`,
          };
        }

        const bankCode = clean.slice(4, 8);
        const accountNumber = clean.slice(8);
        const bankInfo = ROMANIAN_BANKS[bankCode];

        // Check if bank code is 4 letters
        if (!/^[A-Z]{4}$/.test(bankCode)) {
          return {
            iban: clean,
            formatted,
            isValid: false,
            countryCode,
            isRomanian: true,
            bankCode,
            bankName: null,
            swiftBic: null,
            isTreasury: false,
            accountNumber,
            validationError: 'Codul de bancă (pozițiile 5-8) trebuie să fie format din 4 litere',
          };
        }

        // Validate MOD-97 (ISO 7064)
        const checksumValid = checkMod97(clean);
        if (!checksumValid) {
          return {
            iban: clean,
            formatted,
            isValid: false,
            countryCode,
            isRomanian: true,
            bankCode,
            bankName: bankInfo ? bankInfo.name : null,
            swiftBic: bankInfo ? bankInfo.bic : null,
            isTreasury: bankInfo?.isTreasury ?? false,
            accountNumber,
            validationError: 'Cifrele de control sunt invalide (MOD-97 checksum failed)',
          };
        }

        return {
          iban: clean,
          formatted,
          isValid: true,
          countryCode,
          isRomanian: true,
          bankCode,
          bankName: bankInfo ? bankInfo.name : null,
          swiftBic: bankInfo ? bankInfo.bic : null,
          isTreasury: bankInfo?.isTreasury ?? false,
          accountNumber,
          validationError: null,
        };
      }

      // Non-Romanian IBAN validation (general ISO 13616)
      if (clean.length < 15 || clean.length > 34) {
        return {
          iban: clean,
          formatted,
          isValid: false,
          countryCode,
          isRomanian: false,
          bankCode: null,
          bankName: null,
          swiftBic: null,
          isTreasury: false,
          accountNumber: null,
          validationError: `Lungime invalidă pentru un IBAN internațional: are ${clean.length} caractere (trebuie între 15 și 34)`,
        };
      }

      const checksumValid = checkMod97(clean);
      if (!checksumValid) {
        return {
          iban: clean,
          formatted,
          isValid: false,
          countryCode,
          isRomanian: false,
          bankCode: null,
          bankName: null,
          swiftBic: null,
          isTreasury: false,
          accountNumber: null,
          validationError: 'Cifrele de control sunt invalide (MOD-97 checksum failed)',
        };
      }

      return {
        iban: clean,
        formatted,
        isValid: true,
        countryCode,
        isRomanian: false,
        bankCode: null,
        bankName: null,
        swiftBic: null,
        isTreasury: false,
        accountNumber: clean.slice(4),
        validationError: null,
      };
    },
  };
}

/**
 * ISO 7064 MOD 97-10 check
 * Moves initial 4 characters to end, converts letters to digits (A=10..Z=35),
 * and verifies that remainder modulo 97 equals 1.
 */
function checkMod97(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;

  for (let i = 0; i < rearranged.length; i++) {
    const char = rearranged[i];
    const code = char.charCodeAt(0);

    if (code >= 48 && code <= 57) {
      // Digit '0'-'9'
      remainder = (remainder * 10 + (code - 48)) % 97;
    } else if (code >= 65 && code <= 90) {
      // Letter 'A'-'Z' -> 10 to 35 (two digits)
      const val = code - 55;
      const d1 = Math.floor(val / 10);
      const d2 = val % 10;
      remainder = (remainder * 10 + d1) % 97;
      remainder = (remainder * 10 + d2) % 97;
    } else {
      return false;
    }
  }

  return remainder === 1;
}
