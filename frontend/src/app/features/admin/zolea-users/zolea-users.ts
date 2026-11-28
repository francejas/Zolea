import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideSearch } from '@lucide/angular';
import { AccountSummary, AccountType } from '../../../core/api/account.models';
import { AccountsApi } from '../../../core/api/accounts.api';
import { toUserMessage } from '../../../core/errors/error-message';
import { formatDni } from '../../../shared/utils/format';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';
import { ACCOUNT_TYPES, accountName, accountTypeLabel } from './account-format';

type LoadState = 'loading' | 'ready' | 'error';

const PAGE_SIZE = 20;
/** La pausa entre lo que se escribe y el pedido: no uno por letra. */
const SEARCH_DELAY_MS = 300;

/**
 * Usuarios (#72), de la cuenta de Zolea: todas las cuentas de la plataforma, activas y
 * desactivadas. Se busca por nombre, email o DNI, se filtra por tipo y se pagina en el backend. Las
 * acciones están en el detalle de cada cuenta.
 *
 * Se diseña desde la computadora; debajo de 768 px cada fila pasa a ser una tarjeta.
 */
@Component({
  selector: 'app-zolea-users',
  imports: [LucideSearch, RouterLink, ZBtn, ZEmpty, ZProblem, ZSkeleton],
  templateUrl: './zolea-users.html',
  styleUrl: './zolea-users.scss',
})
export class ZoleaUsers {
  private readonly accountsApi = inject(AccountsApi);

  protected readonly types = ACCOUNT_TYPES;
  protected readonly typeLabel = accountTypeLabel;
  protected readonly name = accountName;
  protected readonly dni = (value: string | null) => (value ? formatDni(value) : '—');

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly accounts = signal<AccountSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly totalPages = signal(0);

  /** Lo que está escrito en el buscador; `query` es lo que ya se pidió. */
  protected readonly typed = signal('');
  protected readonly query = signal('');
  protected readonly type = signal<AccountType | null>(null);
  protected readonly page = signal(0);

  protected readonly summary = computed(() => {
    const total = this.total();
    return `${total} ${total === 1 ? 'cuenta' : 'cuentas'}`;
  });

  /** Si hay una búsqueda o un filtro: sin resultados, se ofrece borrarlos. */
  protected readonly filtered = computed(() => this.query() !== '' || this.type() !== null);

  /** Cada pedido lleva un número: una respuesta que llega tarde, de un pedido viejo, no se pinta. */
  private requestId = 0;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.load();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  protected load(): void {
    const id = ++this.requestId;
    // La primera vez (o después de un error) va el esqueleto; después, la tabla queda hasta que llega.
    if (this.state() !== 'ready') this.state.set('loading');

    this.accountsApi
      .search({ q: this.query(), type: this.type(), page: this.page(), size: PAGE_SIZE })
      .subscribe({
        next: (result) => {
          if (id !== this.requestId) return;
          this.accounts.set(result.content);
          this.total.set(result.totalElements);
          this.totalPages.set(result.totalPages);
          this.state.set('ready');
        },
        error: (error: HttpErrorResponse) => {
          if (id !== this.requestId) return;
          this.loadError.set(toUserMessage(error));
          this.state.set('error');
        },
      });
  }

  protected onSearch(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applySearch(), SEARCH_DELAY_MS);
  }

  private applySearch(): void {
    const query = this.typed().trim();
    if (query === this.query()) return;
    this.query.set(query);
    this.page.set(0);
    this.load();
  }

  protected onType(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.type.set(value ? (value as AccountType) : null);
    this.page.set(0);
    this.load();
  }

  protected clearFilters(): void {
    clearTimeout(this.searchTimer);
    this.typed.set('');
    this.query.set('');
    this.type.set(null);
    this.page.set(0);
    this.load();
  }

  protected goTo(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.page.set(page);
    this.load();
  }
}
