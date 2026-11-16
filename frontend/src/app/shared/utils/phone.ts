/**
 * El teléfono de una cuenta: el país, con su código, y el número sin ese código. Se guarda junto,
 * como «+54 2235123456», para que el balneario sepa a qué país llamar. Los teléfonos que se
 * cargaron antes, sin código, se toman como de Argentina.
 */

export interface PhoneCountry {
  /** El código ISO del país: es el valor del selector. */
  iso: string;
  name: string;
  /** El código de país, con el +. */
  dial: string;
  /** Cómo se escribe el número, con ceros: el ejemplo del campo. */
  placeholder: string;
  /** Cuántos números lleva, sin el código de país. */
  minDigits: number;
  maxDigits: number;
  /** Qué escribir, para el error: «10 números: código de área sin 0 y número sin 15». */
  hint: string;
}

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  {
    iso: 'AR',
    name: 'Argentina',
    dial: '+54',
    placeholder: '000 000 0000',
    minDigits: 10,
    maxDigits: 10,
    hint: '10 números: el código de área sin el 0 y el número sin el 15',
  },
  {
    iso: 'UY',
    name: 'Uruguay',
    dial: '+598',
    placeholder: '00 000 000',
    minDigits: 8,
    maxDigits: 8,
    hint: '8 números, sin el 0 del principio',
  },
  {
    iso: 'CL',
    name: 'Chile',
    dial: '+56',
    placeholder: '0 0000 0000',
    minDigits: 9,
    maxDigits: 9,
    hint: '9 números',
  },
  {
    iso: 'PY',
    name: 'Paraguay',
    dial: '+595',
    placeholder: '000 000 000',
    minDigits: 9,
    maxDigits: 9,
    hint: '9 números, sin el 0 del principio',
  },
  {
    iso: 'BR',
    name: 'Brasil',
    dial: '+55',
    placeholder: '00 00000 0000',
    minDigits: 10,
    maxDigits: 11,
    hint: '10 u 11 números, con el código de área',
  },
  {
    iso: 'BO',
    name: 'Bolivia',
    dial: '+591',
    placeholder: '0000 0000',
    minDigits: 8,
    maxDigits: 8,
    hint: '8 números',
  },
  {
    iso: 'PE',
    name: 'Perú',
    dial: '+51',
    placeholder: '000 000 000',
    minDigits: 9,
    maxDigits: 9,
    hint: '9 números',
  },
  {
    iso: 'CO',
    name: 'Colombia',
    dial: '+57',
    placeholder: '000 000 0000',
    minDigits: 10,
    maxDigits: 10,
    hint: '10 números',
  },
  {
    iso: 'MX',
    name: 'México',
    dial: '+52',
    placeholder: '00 0000 0000',
    minDigits: 10,
    maxDigits: 10,
    hint: '10 números',
  },
  {
    iso: 'ES',
    name: 'España',
    dial: '+34',
    placeholder: '000 00 00 00',
    minDigits: 9,
    maxDigits: 9,
    hint: '9 números',
  },
  {
    iso: 'US',
    name: 'Estados Unidos',
    dial: '+1',
    placeholder: '000 000 0000',
    minDigits: 10,
    maxDigits: 10,
    hint: '10 números',
  },
];

/** El país de un teléfono nuevo. */
export const DEFAULT_PHONE_COUNTRY = 'AR';

export function phoneCountry(iso: string): PhoneCountry {
  return PHONE_COUNTRIES.find((country) => country.iso === iso) ?? PHONE_COUNTRIES[0];
}

/** «+54 2235123456»: el código del país, un espacio y los números. */
export function joinPhone(iso: string, digits: string): string {
  return `${phoneCountry(iso).dial} ${digits}`;
}

/**
 * Lo guardado, separado en país y número. Si empieza con un código conocido, se usa el más largo
 * que coincida (+598 antes que +5…); si no tiene código, es un teléfono viejo y es de Argentina.
 */
export function splitPhone(stored: string | null | undefined): { iso: string; digits: string } {
  const value = (stored ?? '').trim();
  if (value.startsWith('+')) {
    const digits = value.replace(/\D/g, '');
    const match = [...PHONE_COUNTRIES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((country) => digits.startsWith(country.dial.slice(1)));
    if (match) return { iso: match.iso, digits: digits.slice(match.dial.length - 1) };
  }
  return { iso: DEFAULT_PHONE_COUNTRY, digits: value.replace(/\D/g, '') };
}

/** El error del número para ese país, o null si está bien. Vacío lo marca la regla de obligatorio. */
export function phoneError(iso: string, digits: string): string | null {
  if (!digits) return null;
  const country = phoneCountry(iso);
  if (digits.length >= country.minDigits && digits.length <= country.maxDigits) return null;
  return `El teléfono de ${country.name} lleva ${country.hint}.`;
}
