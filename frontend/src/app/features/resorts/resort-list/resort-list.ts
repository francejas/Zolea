import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ResortsApi } from '../../../core/api/resorts.api';
import { Amenity, Resort } from '../../../core/api/resort.models';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  standalone: true,
  selector: 'app-resort-list',
  styleUrl: './resort-list.scss',
  templateUrl: './resort-list.html',
})
export class ResortList implements OnInit {
  private resortsApi = inject(ResortsApi);

  resorts = signal<Resort[]>([]);
  isLoading = signal<boolean>(true);
  hasError = signal<boolean>(false);
  searchTerm = signal<string>('');

filteredResorts = computed(() => {
  const term = this.normalizeText(this.searchTerm());
  if (!term) return this.resorts();

  return this.resorts().filter(resort => 
    this.normalizeText(resort.name).includes(term) ||
    this.normalizeText(resort.location).includes(term)
  )
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
    }
  });
}

onSearch(event: Event): void {
  const inputElement = event.target as HTMLInputElement;
  this.searchTerm.set(inputElement.value);
}

clearSearch(): void {
  this.searchTerm.set('');
}

private normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

formatPrice(price: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(price);
}

getMinPrice(resort: Resort): number {
  if (!resort.rentalUnits || resort.rentalUnits.length === 0) return 0;
  return Math.min(...resort.rentalUnits.map((u: any) => u.dailyPrice || 0));
}

getTopAmenities(resort: Resort): Amenity[] {
    if (!resort.amenities) return [];
    return resort.amenities.slice(0, 3);
  }


}