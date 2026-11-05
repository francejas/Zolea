import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideCheck, LucideMapPin, LucideSearch } from '@lucide/angular';
import { Amenity, Resort } from '../../../core/api/resort.models';
import { ResortsApi } from '../../../core/api/resorts.api';
import { ZEmpty } from '../../../shared/z-empty/z-empty';
import { ZProblem } from '../../../shared/z-problem/z-problem';
import { ZSkeleton } from '../../../shared/z-skeleton/z-skeleton';

/** Cuántos servicios se ven en la tarjeta; el resto se resume en «+N». */
const VISIBLE_AMENITIES = 3;

/** Se crea una sola vez: un Intl.NumberFormat nuevo por cada tarjeta y cada dibujo es caro. */
const pesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

/** La Portada: qué es Zolea y el listado de balnearios, con un buscador por nombre o ubicación. */
@Component({
  imports: [RouterLink, LucideCheck, LucideMapPin, LucideSearch, ZEmpty, ZProblem, ZSkeleton],
  selector: 'app-resort-list',
  styleUrl: './resort-list.scss',
  templateUrl: './resort-list.html',
})
export class ResortList implements OnInit {
  private resortsApi = inject(ResortsApi);
  private searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly visibleAmenities = VISIBLE_AMENITIES;

  resorts = signal<Resort[]>([]);
  isLoading = signal<boolean>(true);
  hasError = signal<boolean>(false);
  searchTerm = signal<string>('');

  filteredResorts = computed(() => {
    const term = this.normalizeText(this.searchTerm());
    if (!term) return this.resorts();

    return this.resorts().filter(
      (resort) =>
        this.normalizeText(resort.name).includes(term) ||
        this.normalizeText(resort.location).includes(term),
    );
  });

  /** El texto corto que anuncia el lector de pantalla cuando cambia el resultado. */
  resultsSummary = computed(() => {
    const count = this.filteredResorts().length;
    return count === 1 ? '1 balneario' : `${count} balnearios`;
  });

  ngOnInit(): void {
    this.loadResorts();
  }

  loadResorts(): void {
    this.isLoading.set(true);
    this.hasError.set(false);

    this.resortsApi.list().subscribe({
      next: (data) => {
        this.resorts.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  onSearch(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.searchTerm.set(inputElement.value);
  }

  /** Borra la búsqueda y devuelve el foco al buscador: el botón que se tocó desaparece. */
  clearSearch(): void {
    this.searchTerm.set('');
    this.searchInput().nativeElement.focus();
  }

  /** Sin mayúsculas, sin tildes y sin espacios sobrantes en los bordes. */
  private normalizeText(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  formatPrice(price: number): string {
    return pesos.format(price);
  }

  /** El precio por día más bajo entre las unidades disponibles, o null si no hay ninguna. */
  getMinPrice(resort: Resort): number | null {
    const prices = (resort.rentalUnits ?? [])
      .filter((unit) => !unit.isBlocked)
      .map((unit) => unit.dailyPrice);
    return prices.length > 0 ? Math.min(...prices) : null;
  }

  getTopAmenities(resort: Resort): Amenity[] {
    return (resort.amenities ?? []).slice(0, VISIBLE_AMENITIES);
  }
}
