import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideImagePlus,
  LucideTrash2,
  LucideX,
} from '@lucide/angular';
import { ResortPhoto } from '../../../../core/api/resort.models';
import { ResortsApi } from '../../../../core/api/resorts.api';
import { toUserMessage } from '../../../../core/errors/error-message';
import { ZAlert } from '../../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../../shared/z-btn/z-btn';

/** Lo mismo que revisa el backend: hasta 10 fotos, jpg, png o webp, de hasta 5 MB cada una. */
export const MAX_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Una foto elegida que todavía no se subió, con su vista previa. */
interface PendingPhoto {
  key: number;
  file: File;
  preview: string;
}

/** Un archivo que no se puede subir, y por qué. */
interface RejectedFile {
  name: string;
  reason: string;
}

interface Notice {
  title: string;
  text: string;
}

/**
 * Las fotos de Mi balneario (GH-67): subir varias a la vez, con vista previa; cambiar el orden con
 * subir y bajar; borrar con confirmación. Se guardan en el momento, no con «Guardar cambios».
 *
 * Los archivos se revisan antes de mandarlos, con las mismas reglas que el backend, así el
 * administrador ve cuáles no van y por qué sin perder los que sí. Cada cambio avisa la lista nueva
 * con `photosChange`: la pantalla actualiza la portada y la vista previa.
 */
@Component({
  selector: 'app-resort-photos',
  imports: [LucideArrowDown, LucideArrowUp, LucideImagePlus, LucideTrash2, LucideX, ZAlert, ZBtn],
  templateUrl: './resort-photos.html',
  styleUrl: './resort-photos.scss',
})
export class ResortPhotos {
  private readonly resortsApi = inject(ResortsApi);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly deleteDialog = viewChild.required<ElementRef<HTMLDialogElement>>('deleteDialog');

  /** Las fotos del balneario, en su orden. */
  readonly photos = input.required<ResortPhoto[]>();
  /** La lista nueva, cada vez que cambia. */
  readonly photosChange = output<ResortPhoto[]>();

  protected readonly pending = signal<PendingPhoto[]>([]);
  protected readonly rejected = signal<RejectedFile[]>([]);
  protected readonly busy = signal<'upload' | 'order' | 'delete' | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly error = signal<Notice | null>(null);
  /** Dónde quedó la foto que se movió: lo lee el lector de pantalla. */
  protected readonly moveStatus = signal('');
  protected readonly toDelete = signal<ResortPhoto | null>(null);

  /** Cuántas fotos más entran, contando las que ya están elegidas para subir. */
  protected readonly room = computed(
    () => MAX_PHOTOS - this.photos().length - this.pending().length,
  );
  protected readonly accept = PHOTO_TYPES.join(',');
  protected readonly maxPhotos = MAX_PHOTOS;

  private nextKey = 0;

  constructor() {
    // Las vistas previas ocupan memoria hasta que se sueltan.
    inject(DestroyRef).onDestroy(() =>
      this.pending().forEach((p) => URL.revokeObjectURL(p.preview)),
    );
  }

  protected choose(): void {
    this.fileInput().nativeElement.click();
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Vacío, para que elegir otra vez el mismo archivo vuelva a avisar.
    input.value = '';
    this.addFiles(files);
  }

  /** Separa las que van de las que no, con el motivo de cada una. */
  addFiles(files: File[]): void {
    this.notice.set(null);
    this.error.set(null);
    let room = this.room();
    const accepted: PendingPhoto[] = [];
    const rejected: RejectedFile[] = [];
    for (const file of files) {
      if (!PHOTO_TYPES.includes(file.type)) {
        rejected.push({ name: file.name, reason: 'no es una foto jpg, png o webp.' });
      } else if (file.size > MAX_PHOTO_BYTES) {
        rejected.push({ name: file.name, reason: 'pesa más de 5 MB.' });
      } else if (room <= 0) {
        rejected.push({
          name: file.name,
          reason: `no entra: el balneario tiene hasta ${MAX_PHOTOS} fotos.`,
        });
      } else {
        accepted.push({ key: this.nextKey++, file, preview: URL.createObjectURL(file) });
        room--;
      }
    }
    this.pending.update((pending) => [...pending, ...accepted]);
    this.rejected.set(rejected);
  }

  protected removePending(key: number): void {
    const removed = this.pending().find((p) => p.key === key);
    if (removed) URL.revokeObjectURL(removed.preview);
    this.pending.update((pending) => pending.filter((p) => p.key !== key));
  }

  protected clearPending(): void {
    this.pending().forEach((p) => URL.revokeObjectURL(p.preview));
    this.pending.set([]);
    this.rejected.set([]);
  }

  protected upload(): void {
    const files = this.pending().map((p) => p.file);
    if (files.length === 0 || this.busy()) return;
    this.busy.set('upload');
    this.error.set(null);
    this.resortsApi.uploadPhotos(files).subscribe({
      next: (photos) => {
        this.busy.set(null);
        this.clearPending();
        this.photosChange.emit(photos);
        this.showNotice({
          title: files.length === 1 ? 'Subimos la foto' : `Subimos ${files.length} fotos`,
          text: 'Ya se ven en la Ficha de tu balneario.',
        });
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(null);
        this.error.set({ title: 'No se pudieron subir las fotos', text: toUserMessage(error) });
        // Un 400 puede ser que en otra pestaña se subieron fotos: se trae la lista como está.
        if (error.status === 400) this.refresh();
      },
    });
  }

  protected move(photo: ResortPhoto, step: -1 | 1): void {
    const list = [...this.photos()];
    const from = list.findIndex((p) => p.idPhoto === photo.idPhoto);
    const to = from + step;
    if (from < 0 || to < 0 || to >= list.length || this.busy()) return;
    [list[from], list[to]] = [list[to], list[from]];

    this.busy.set('order');
    this.notice.set(null);
    this.error.set(null);
    this.resortsApi.orderPhotos(list.map((p) => p.idPhoto)).subscribe({
      next: (photos) => {
        this.busy.set(null);
        this.photosChange.emit(photos);
        const place = photos.findIndex((p) => p.idPhoto === photo.idPhoto);
        this.moveStatus.set(
          place === 0
            ? 'La foto pasó al lugar 1: ahora es la portada.'
            : `La foto pasó al lugar ${place + 1} de ${photos.length}.`,
        );
        // El foco sigue en la foto que se movió; si el botón que se tocó quedó deshabilitado (llegó
        // a una punta), pasa al otro.
        afterNextRender(
          () => {
            const row = this.host.nativeElement.querySelector(`[data-photo="${photo.idPhoto}"]`);
            const same = row?.querySelector<HTMLButtonElement>(`[data-move="${step}"]`);
            const other = row?.querySelector<HTMLButtonElement>(`[data-move="${-step}"]`);
            (same && !same.disabled ? same : other)?.focus();
          },
          { injector: this.injector },
        );
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(null);
        this.error.set({ title: 'No se pudo cambiar el orden', text: toUserMessage(error) });
        // Un 400 es que las fotos cambiaron en otro lado: se trae la lista como está.
        if (error.status === 400) this.refresh();
      },
    });
  }

  protected askDelete(photo: ResortPhoto): void {
    this.notice.set(null);
    this.error.set(null);
    this.toDelete.set(photo);
    this.deleteDialog().nativeElement.showModal();
  }

  /** «Volver» y Esc. Puede correr dos veces: la segunda no hace nada. */
  protected closeDelete(): void {
    const dialog = this.deleteDialog().nativeElement;
    if (dialog.open) dialog.close();
    if (!this.busy()) this.toDelete.set(null);
  }

  /** Mientras se borra, Esc no cierra el diálogo. */
  protected onDialogCancel(event: Event): void {
    if (this.busy()) event.preventDefault();
  }

  protected confirmDelete(): void {
    const photo = this.toDelete();
    if (!photo || this.busy()) return;
    this.busy.set('delete');
    this.resortsApi.deletePhoto(photo.idPhoto).subscribe({
      next: () => {
        this.busy.set(null);
        this.closeDelete();
        this.photosChange.emit(this.photos().filter((p) => p.idPhoto !== photo.idPhoto));
        this.showNotice({ title: 'Borramos la foto', text: 'Ya no se ve en la Ficha.' });
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(null);
        this.closeDelete();
        this.error.set({ title: 'No se pudo borrar la foto', text: toUserMessage(error) });
        // Un 404 es que ya no estaba (se borró en otra pestaña): se trae la lista como está.
        if (error.status === 404) this.refresh();
      },
    });
  }

  protected place(photo: ResortPhoto): number {
    return this.photos().findIndex((p) => p.idPhoto === photo.idPhoto) + 1;
  }

  /** Las fotos como están en el backend, después de un error que dice que cambiaron. */
  private refresh(): void {
    this.resortsApi.mine().subscribe({
      next: (resort) => this.photosChange.emit(resort.photos),
      error: () => undefined,
    });
  }

  /** El aviso de arriba toma el foco: el botón que se tocó puede haber desaparecido. */
  private showNotice(notice: Notice): void {
    this.notice.set(notice);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('#photos-notice')?.focus(),
      { injector: this.injector },
    );
  }
}
