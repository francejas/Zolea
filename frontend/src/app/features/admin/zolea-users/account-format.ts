import { AccountSummary, AccountType } from '../../../core/api/account.models';

/** Los tipos de cuenta, en el orden del filtro de Usuarios (#72). */
export const ACCOUNT_TYPES: readonly { value: AccountType; label: string }[] = [
  { value: 'CLIENT', label: 'Clientes' },
  { value: 'RESORT_ADMIN', label: 'Administradores de balneario' },
  { value: 'ZOLEA', label: 'Cuenta de Zolea' },
];

/** El tipo de una cuenta, en singular. */
export function accountTypeLabel(type: AccountType): string {
  switch (type) {
    case 'CLIENT':
      return 'Cliente';
    case 'RESORT_ADMIN':
      return 'Administrador';
    case 'ZOLEA':
      return 'Cuenta de Zolea';
  }
}

export function accountName(account: Pick<AccountSummary, 'firstName' | 'lastName'>): string {
  return `${account.firstName} ${account.lastName}`.trim();
}
