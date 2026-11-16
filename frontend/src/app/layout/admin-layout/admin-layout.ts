import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, computed, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideArrowUpRight,
  LucideHouse,
  LucideLayoutDashboard,
  LucideLogOut,
  LucideMenu,
  LucideScanLine,
  LucideTag,
  LucideTicket,
  LucideUmbrella,
  LucideUserPlus,
  LucideUsers,
  LucideX,
} from '@lucide/angular';
import { filter } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Resort } from '../../core/api/resort.models';
import { isZoleaAccount, ZOLEA_HOME } from '../../core/auth/home';
import { SessionService } from '../../core/session/session.service';

/**
 * El marco del panel del administrador: la barra lateral y al lado la pantalla. Debajo de 1024 px
 * la barra se esconde detrás de un botón y se abre como un cajón por encima de la pantalla.
 */
@Component({
  selector: 'app-admin-layout',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    LucideArrowUpRight,
    LucideHouse,
    LucideLayoutDashboard,
    LucideLogOut,
    LucideMenu,
    LucideScanLine,
    LucideTag,
    LucideTicket,
    LucideUmbrella,
    LucideUserPlus,
    LucideUsers,
    LucideX,
  ],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {
  private readonly session = inject(SessionService);

  /**
   * La cuenta de Zolea (12.9): no tiene balneario y del panel solo usa el catálogo de servicios.
   * Su barra lleva solo eso, y el administrador de un balneario ve todo lo demás.
   */
  protected readonly zolea = computed(() => isZoleaAccount(this.session.user()));

  /** Adonde lleva el logo: el inicio del panel de cada uno. */
  protected readonly home = computed(() => (this.zolea() ? ZOLEA_HOME : '/admin'));

  /** El balneario que administra: cada admin ve solo el suyo. La cuenta de Zolea no lo pide. */
  protected readonly resort = httpResource<Resort>(() =>
    this.zolea() ? undefined : `${environment.apiUrl}/api/resorts/my`,
  );

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
