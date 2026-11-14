import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import {
  form,
  FormField,
  maxLength,
  pattern,
  required,
  SchemaPath,
  submit,
  validate,
} from '@angular/forms/signals';
import { LucideCheck, LucideDynamicIcon, LucideIcon, LucideMapPin } from '@lucide/angular';
import { catchError, firstValueFrom, forkJoin, map, of } from 'rxjs';
import { AmenitiesApi } from '../../../core/api/amenities.api';
import { Amenity, Resort, ResortRequest } from '../../../core/api/resort.models';
import { ResortsApi } from '../../../core/api/resorts.api';
import { toFieldErrors, toUserMessage } from '../../../core/errors/error-message';
import { SessionService } from '../../../core/session/session.service';
import { amenityIcon, byAmenityId } from '../../../shared/utils/amenity-icons';
import { ZAlert } from '../../../shared/z-alert/z-alert';
import { ZBtn } from '../../../shared/z-btn/z-btn';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZField } from '../../../shared/z-field/z-field';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';

type LoadState = 'loading' | 'ready' | 'no-resort' | 'error';

/** El formulario: se llama como el pedido al backend, así `toFieldErrors` pega cada error en su campo. */
interface ResortModel {
  name: string;
  location: string;
  description: string;
  coverPhotoUrl: string;
  amenityIds: number[];
}

/** Lo que entra en las columnas de texto de la base. */
const MAX_TEXT = 255;
/** Una dirección de imagen: vacía o con http(s)://. */
const PHOTO_URL = /^(https?:\/\/\S+)?$/;

/** Cuántos servicios muestra la tarjeta de la Portada; el resto va como «+N». */
const VISIBLE_AMENITIES = 3;

/** Como en la Portada: pesos sin centavos. */
const pesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const toModel = (resort: Resort): ResortModel => ({
  name: resort.name,
  location: resort.location,
  description: resort.description ?? '',
  coverPhotoUrl: resort.coverPhotoUrl ?? '',
  amenityIds: resort.amenities.map((amenity) => amenity.idAmenity),
});

const emptyModel = (): ResortModel => ({
  name: '',
  location: '',
  description: '',
  coverPhotoUrl: '',
  amenityIds: [],
});

/** Siempre completo: el backend conserva lo que llegue vacío, y así no se pierde nada. */
const toRequest = (value: ResortModel): ResortRequest => ({
  name: value.name.trim(),
  location: value.location.trim(),
  description: value.description.trim(),
  coverPhotoUrl: value.coverPhotoUrl.trim(),
  amenityIds: value.amenityIds,
});

/**
 * Obligatorio y que entre en la base. Uno con solo espacios también está vacío: el backend lo
 * ignoraría y se quedaría con el que estaba, sin avisar.
 */
function requiredText(path: SchemaPath<string>, message: string): void {
  required(path, { message });
  validate(path, ({ value }) =>
    value() !== '' && value().trim() === '' ? { kind: 'required', message } : null,
  );
  maxLength(path, MAX_TEXT, { message: `Hasta ${MAX_TEXT} caracteres.` });
}

const sameIds = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** El aviso de arriba de la baja: qué pasó al desactivar o reactivar. */
interface ActiveNotice {
  title: string;
  text: string;
}

/**
 * Mi balneario (`/admin/resort`): la cuenta del administrador, los datos del balneario, los servicios
 * que ofrece y su baja (12.5). A la derecha, la tarjeta de la Portada armada con lo que se está
 * escribiendo, para ver cómo lo encuentran los clientes antes de guardar.
 *
 * Los servicios los carga la cuenta de Zolea (15.7): acá el balneario solo elige cuáles ofrece.
 */
@Component({
  selector: 'app-my-resort',
  imports: [
    FormField,
    LucideCheck,
    LucideDynamicIcon,
    LucideMapPin,
    ZAlert,
    ZBtn,
    ZEmpty,
    ZField,
    ZProblem,
    ZSkeleton,
  ],
  templateUrl: './my-resort.html',
  styleUrl: './my-resort.scss',
})
export class MyResort {
  private readonly resortsApi = inject(ResortsApi);
  private readonly amenitiesApi = inject(AmenitiesApi);
  private readonly session = inject(SessionService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly deactivateDialog = viewChild<ElementRef<HTMLDialogElement>>('deactivateDialog');

  protected readonly state = signal<LoadState>('loading');
  /** El balneario como está guardado: contra esto se ve si hay cambios sin guardar. */
  protected readonly resort = signal<Resort | null>(null);
  protected readonly catalog = signal<Amenity[]>([]);

  private readonly model = signal<ResortModel>(emptyModel());
  protected readonly resortForm = form(this.model, (path) => {
    requiredText(path.name, 'Escribí el nombre del balneario.');
    requiredText(path.location, 'Escribí la dirección del balneario.');
    maxLength(path.coverPhotoUrl, MAX_TEXT, { message: `Hasta ${MAX_TEXT} caracteres.` });
    pattern(path.coverPhotoUrl, PHOTO_URL, {
      message: 'Pegá la dirección completa de la imagen, la que empieza con https://.',
    });
  });

  /** Se guardó: el aviso queda mientras no se toque nada. */
  protected readonly saved = signal(false);
  /** El error de guardar que no es de un campo. */
  protected readonly formError = signal('');

  protected readonly toggling = signal(false);
  protected readonly activeNotice = signal<ActiveNotice | null>(null);
  /** El error de desactivar o reactivar: el título dice cuál de los dos falló. */
  protected readonly activeError = signal<ActiveNotice | null>(null);

  /** La dirección de la foto que no se pudo cargar: la tarjeta vuelve al dibujo de cielo y mar. */
  private readonly brokenPhoto = signal<string | null>(null);

  protected readonly account = computed(() => {
    const user = this.session.user();
    return user ? { name: `${user.firstName} ${user.lastName}`, email: user.email } : null;
  });

  /** Hay algo distinto de lo guardado. */
  protected readonly changed = computed(() => {
    const resort = this.resort();
    if (!resort) return false;
    const saved = toModel(resort);
    const value = this.model();
    return (
      value.name.trim() !== saved.name ||
      value.location.trim() !== saved.location ||
      value.description.trim() !== saved.description ||
      value.coverPhotoUrl.trim() !== saved.coverPhotoUrl ||
      !sameIds(value.amenityIds, saved.amenityIds)
    );
  });

  /** La tarjeta de la Portada, con lo que hay escrito ahora. */
  protected readonly preview = computed(() => {
    const value = this.model();
    const photo = value.coverPhotoUrl.trim();
    // Por id, como la Portada: el catálogo y el backend no garantizan el orden.
    const offered = this.catalog()
      .filter((amenity) => value.amenityIds.includes(amenity.idAmenity))
      .sort(byAmenityId);
    // Como la Portada: sin las bloqueadas ni las dadas de baja, que la Portada no recibe.
    const prices = (this.resort()?.rentalUnits ?? [])
      .filter((unit) => !unit.isBlocked && !unit.retired)
      .map((unit) => unit.dailyPrice);
    return {
      name: value.name.trim() || 'Nombre del balneario',
      location: value.location.trim() || 'Dirección del balneario',
      photo: photo && PHOTO_URL.test(photo) && photo !== this.brokenPhoto() ? photo : null,
      photoBroken: photo !== '' && photo === this.brokenPhoto(),
      amenities: offered.slice(0, VISIBLE_AMENITIES),
      moreAmenities: Math.max(offered.length - VISIBLE_AMENITIES, 0),
      price: prices.length > 0 ? pesos.format(Math.min(...prices)) : null,
    };
  });

  protected readonly skeletonLines = [1, 2, 3, 4];

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    // Cada pedido se resuelve por su cuenta: si uno falla, el otro no queda cortado a la mitad.
    forkJoin({
      resort: this.resortsApi.mine().pipe(
        map((resort) => ({ resort, status: 200 })),
        catchError((error: HttpErrorResponse) => of({ resort: null, status: error.status })),
      ),
      catalog: this.amenitiesApi.list().pipe(catchError(() => of(null))),
    }).subscribe(({ resort, catalog }) => {
      if (!resort.resort) {
        this.state.set(resort.status === 404 ? 'no-resort' : 'error');
        return;
      }
      if (catalog === null) {
        this.state.set('error');
        return;
      }
      this.catalog.set(catalog);
      this.show(resort.resort);
      this.state.set('ready');
    });
  }

  protected amenityIcon(name: string): LucideIcon {
    return amenityIcon(name);
  }

  protected isOffered(id: number): boolean {
    return this.model().amenityIds.includes(id);
  }

  protected toggleAmenity(id: number): void {
    this.model.update((value) => ({
      ...value,
      amenityIds: value.amenityIds.includes(id)
        ? value.amenityIds.filter((offered) => offered !== id)
        : [...value.amenityIds, id],
    }));
  }

  protected onPhotoError(url: string): void {
    this.brokenPhoto.set(url);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.save();
  }

  private async save(): Promise<void> {
    // Mientras el pedido está en curso no se manda otro: el botón también queda deshabilitado.
    if (this.resortForm().submitting()) return;
    this.saved.set(false);
    this.formError.set('');

    await submit(this.resortForm, async () => {
      try {
        const { resort } = await firstValueFrom(
          this.resortsApi.updateMine(toRequest(this.resortForm().value())),
        );
        this.show(resort);
        this.saved.set(true);
        return;
      } catch (error) {
        const err = error as HttpErrorResponse;
        const fieldErrors = toFieldErrors(this.resortForm, err);
        if (fieldErrors.length > 0) return fieldErrors;
        this.formError.set(toUserMessage(err));
        return;
      }
    });

    // Con errores, el foco va al primer campo marcado (sistema de diseño, «Campo»).
    afterNextRender(
      () =>
        this.host.nativeElement.querySelector<HTMLElement>('.z-field--invalid .z-input')?.focus(),
      { injector: this.injector },
    );
  }

  protected askDeactivate(): void {
    this.activeError.set(null);
    this.activeNotice.set(null);
    this.deactivateDialog()?.nativeElement.showModal();
  }

  protected closeDeactivate(): void {
    const dialog = this.deactivateDialog()?.nativeElement;
    if (dialog?.open) dialog.close();
  }

  protected confirmDeactivate(): void {
    this.setActive(false);
  }

  protected reactivate(): void {
    this.activeError.set(null);
    this.activeNotice.set(null);
    this.setActive(true);
  }

  private setActive(active: boolean): void {
    const resort = this.resort();
    if (!resort || this.toggling()) return;
    this.toggling.set(true);
    // El aviso de guardado habla de si los clientes ya ven lo nuevo: con el cambio deja de ser cierto.
    this.saved.set(false);

    const request = active
      ? this.resortsApi.activate(resort.idResort)
      : this.resortsApi.deactivate(resort.idResort);
    request.subscribe({
      next: ({ resort: saved }) => {
        this.closeDeactivate();
        this.toggling.set(false);
        // Solo cambia si está publicado: lo que se esté editando en el formulario no se toca.
        this.resort.update((current) => (current ? { ...current, active: saved.active } : saved));
        this.activeNotice.set(
          saved.active
            ? {
                title: `Reactivamos ${saved.name}`,
                text: 'Vuelve a aparecer en la Portada y a tomar reservas.',
              }
            : {
                title: `Desactivamos ${saved.name}`,
                text: 'Ya no aparece en la Portada. Las reservas que tenía siguen valiendo.',
              },
        );
        // El botón que se tocó cambió por el otro: el foco pasa al aviso, que así también se lee.
        afterNextRender(
          () =>
            this.host.nativeElement.querySelector<HTMLElement>('#my-resort-active-notice')?.focus(),
          { injector: this.injector },
        );
      },
      error: (error: HttpErrorResponse) => {
        this.closeDeactivate();
        this.toggling.set(false);
        this.activeError.set({
          title: active ? 'No se pudo reactivar' : 'No se pudo desactivar',
          text: toUserMessage(error),
        });
      },
    });
  }

  /** El balneario como quedó guardado, también en el formulario. */
  private show(resort: Resort): void {
    this.resort.set(resort);
    this.resortForm().reset(toModel(resort));
  }
}
