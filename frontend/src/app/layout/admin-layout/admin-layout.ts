import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, computed, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Resort } from '../../core/api/resort.models';
import { SessionService } from '../../core/session/session.service';

/**
 * El marco del panel del administrador: la barra lateral y al lado la pantalla. Debajo de 1024 px
 * la barra se esconde detrás de un botón y se abre como un cajón por encima de la pantalla.
 */
@Component({
  selector: 'app-admin-layout',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {
  private readonly session = inject(SessionService);

  /** El balneario que administra: cada admin ve solo el suyo. */
  protected readonly resort = httpResource<Resort>(() => `${environment.apiUrl}/api/resorts/my`);

  /** El 404 de `/api/resorts/my` es un administrador sin balneario asignado. */
  protected readonly withoutResort = computed(() => {
    const error = this.resort.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });

  private readonly drawer = viewChild.required<ElementRef<HTMLDialogElement>>('drawer');
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  constructor() {
    // Al cambiar de pantalla, el cajón se cierra solo.
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeDrawer());

    // Si la pantalla pasa a ser ancha con el cajón abierto (una tableta que se gira), se cierra:
    // un diálogo modal abierto deja inerte todo lo demás.
    const wide = matchMedia('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent) => event.matches && this.closeDrawer();
    wide.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => wide.removeEventListener('change', onChange));
  }

  protected openDrawer(): void {
    this.drawer().nativeElement.showModal();
  }

  protected closeDrawer(): void {
    this.drawer().nativeElement.close();
  }

  /** Un clic en el fondo oscuro, fuera del cajón, lo cierra. */
  protected onDrawerClick(event: MouseEvent): void {
    if (event.target === this.drawer().nativeElement) {
      this.closeDrawer();
    }
  }

  /** Con el router, `href="#contenido"` llevaría a la portada: el salto mueve el foco a mano. */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.main().nativeElement.focus();
  }

  protected logout(): void {
    this.closeDrawer();
    this.session.logout();
  }
}
