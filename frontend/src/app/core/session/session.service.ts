import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LoginRequest, LoginResponse, Me } from '../api/auth.models';
import { catchError, map, Observable, of, switchMap, tap, throwError } from 'rxjs';

const TOKEN_KEY = 'zolea.token';

/**
 * Sabe quién está adentro. Lo usan el interceptor, los guards, las barras y las pantallas.
 * El rol sale siempre de `/me`, nunca de leer el token por dentro.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly authUrl = `${environment.apiUrl}/api/auth`;

  private readonly storedToken = signal<string | null>(readStoredToken());
  private readonly currentUser = signal<Me | null>(null);

  /** El `Me` de quien está adentro, o `null` si no hay sesión. */
  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.currentUser() !== null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');

  /** El token guardado, o `null`. Lo lee el interceptor. */
  token(): string | null {
    return this.storedToken();
  }

  /**
   * Pide el token, lo guarda y carga el usuario desde `/me`.
   * Si algo falla, deja la sesión limpia y propaga el error para que la pantalla lo muestre.
   */
  login(email: string, password: string): Observable<Me> {
    const body: LoginRequest = { email, password };
    return this.http.post<LoginResponse>(`${this.authUrl}/login`, body).pipe(
      // El token se guarda antes de pedir /me, para que el interceptor ya lo adjunte.
      tap((response) => this.saveToken(response.token)),
      switchMap(() => this.loadMe()),
      catchError((error) => {
        this.clear();
        return throwError(() => error);
      }),
    );
  }

  /**
   * Si hay token guardado, pide `/me`. Si falla, limpia todo sin avisar.
   * Nunca emite error: es lo que corre antes de la primera navegación.
   */
  restore(): Observable<void> {
    if (this.token() === null) {
      return of(undefined);
    }
    return this.loadMe().pipe(
      map(() => undefined),
      catchError(() => {
        this.clear();
        return of(undefined);
      }),
    );
  }

  /** Borra el token y el usuario, sin navegar. */
  clear(): void {
    this.storedToken.set(null);
    this.currentUser.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Sin acceso a localStorage no hay nada más que borrar.
    }
  }

  /** `clear()` y vuelve a la portada. */
  logout(): void {
    this.clear();
    void this.router.navigateByUrl('/');
  }

  private loadMe(): Observable<Me> {
    return this.http.get<Me>(`${this.authUrl}/me`).pipe(tap((me) => this.currentUser.set(me)));
  }

  private saveToken(token: string): void {
    this.storedToken.set(token);
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Sin localStorage la sesión dura hasta recargar la página, pero anda.
    }
  }
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
