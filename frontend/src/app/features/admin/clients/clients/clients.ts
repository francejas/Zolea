import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ZBtn } from '../../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../../shared/z-empty/z-empty';
import { ZProblem } from '../../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../../shared/z-skeleton/z-skeleton';
import { ClientsApi } from '../../../../core/api/clients.api';
import { ResortClient } from '../../../../core/api/resort-client.models';
import { filterClients } from '../client-filters';
import { bookingNumber, money } from '../../../../shared/utils/format';
import { BOOKING_STATUS } from '../../../bookings/booking-format';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toUserMessage } from '../../../../core/errors/error-message';

@Component({
  selector: 'app-clients',
  imports: [RouterLink, ZBtn, ZEmpty, ZProblem, ZSkeleton],
  templateUrl: './clients.html',
  styleUrl: './clients.scss',
})
export class Clients {
  private readonly injector = inject(Injector);
  private readonly api = inject(ClientsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly historyDialog = viewChild<ElementRef<HTMLDialogElement>>('historyDialog');

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly clients = signal<ResortClient[]>([]);
  protected readonly query = signal('');
  protected readonly error = signal('');
  protected readonly selected = signal<ResortClient | null>(null);

  protected readonly visibleClients = computed(() => filterClients(this.clients(), this.query()));

  /** Más recientes primero, sin modificar las reservas recibidas del backend. */
  protected readonly history = computed(() =>
    [...(this.selected()?.bookings ?? [])].sort(
      (a, b) => b.startDate.localeCompare(a.startDate) || b.idBooking - a.idBooking,
    ),
  );

  protected readonly bookingNumber = bookingNumber;
  protected readonly money = money;
  protected readonly statuses = BOOKING_STATUS;

  private loadingStarted = false;

  constructor() {
    this.load();
  }

  protected load(): void {
    if (this.state() === 'loading' && this.loadingStarted) return;

    this.loadingStarted = true;
    this.state.set('loading');
    this.error.set('');

    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (clients) => {
          this.clients.set(clients);
          this.state.set('ready');
        },
        error: (error: HttpErrorResponse) => {
          this.error.set(toUserMessage(error));
          this.state.set('error');
        },
      });
  }

  protected showHistory(client: ResortClient): void {
    this.selected.set(client);

    // El título y los controles deben existir antes de abrir el diálogo.
    afterNextRender(
      () => {
        if (this.selected() !== client) return;

        const dialog = this.historyDialog()?.nativeElement;

        if (dialog && !dialog.open) {
          dialog.showModal();
        }
      },
      { injector: this.injector },
    );
  }

  protected closeHistory(): void {
    this.historyDialog()?.nativeElement.close();
    this.selected.set(null);
  }

  protected date(value: string): string {
    return value.split('-').reverse().join('/');
  }
}
