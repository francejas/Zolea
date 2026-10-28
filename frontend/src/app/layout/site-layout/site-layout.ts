import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SessionService } from '../../core/session/session.service';

/**
 * El marco del sitio, para el público y el cliente: la barra superior y debajo la pantalla. En el
 * celular, la sesión y los accesos se pliegan en un menú que se abre debajo de la barra.
 */
@Component({
  selector: 'app-site-layout',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './site-layout.html',
  styleUrl: './site-layout.scss',
  host: {
    '(document:keydown.escape)': 'closeMenus()',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class SiteLayout {
  protected readonly session = inject(SessionService);

  protected readonly userMenuOpen = signal(false);
  protected readonly sheetOpen = signal(false);

  protected readonly initials = computed(() => {
    const user = this.session.user();
    return user ? user.firstName.charAt(0) + user.lastName.charAt(0) : '';
  });

  private readonly userMenu = viewChild<ElementRef<HTMLElement>>('userMenu');
  private readonly userButton = viewChild<ElementRef<HTMLButtonElement>>('userButton');
  private readonly sheetButton = viewChild.required<ElementRef<HTMLButtonElement>>('sheetButton');
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  constructor() {
    // Al cambiar de pantalla, los menús se cierran solos.
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.userMenuOpen.set(false);
        this.sheetOpen.set(false);
      });
  }

  /** Escape cierra lo que esté abierto y devuelve el foco al botón que lo abrió. */
  protected closeMenus(): void {
    if (this.userMenuOpen()) {
      this.userMenuOpen.set(false);
      this.userButton()?.nativeElement.focus();
    }
    if (this.sheetOpen()) {
      this.sheetOpen.set(false);
      this.sheetButton().nativeElement.focus();
    }
  }

  /** Un clic afuera del menú de la persona lo cierra. */
  protected onDocumentClick(event: MouseEvent): void {
    const menu = this.userMenu()?.nativeElement;
    if (this.userMenuOpen() && !menu?.contains(event.target as Node)) {
      this.userMenuOpen.set(false);
    }
  }

  /** Si el foco sale del menú de la persona con Tab, el menú se cierra. */
  protected onUserMenuFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.userMenu()?.nativeElement.contains(next)) {
      this.userMenuOpen.set(false);
    }
  }

  /** Con el router, `href="#contenido"` llevaría a la portada: el salto mueve el foco a mano. */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.main().nativeElement.focus();
  }

  protected logout(): void {
    this.userMenuOpen.set(false);
    this.sheetOpen.set(false);
    this.session.logout();
  }
}
