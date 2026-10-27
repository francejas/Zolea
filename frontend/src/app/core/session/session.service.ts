import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

/** Lo que devuelve `GET /api/auth/me`. */
export interface Me {
  idClient: number;
  firstName: string;
  lastName: string;
  email: string;
  role: 'USER' | 'ADMIN';
  idManagedResort: number | null;
}

/** Las dos cuentas de demostración del backend, tal como las devuelve `/me`. */
const DEMO_USERS: Record<string, Me> = {
  USER: {
    idClient: 7,
    firstName: 'Santiago',
    lastName: 'Rodríguez',
    email: 'santi.rodriguez@gmail.com',
    role: 'USER',
    idManagedResort: null,
  },
  ADMIN: {
    idClient: 2,
    firstName: 'Maximiliano',
    lastName: 'Soria',
    email: 'admin.mdp@zolea.com',
    role: 'ADMIN',
    idManagedResort: 1,
  },
};

/**
 * PROVISORIO: lo reemplaza entero la 8.2 (ZOL-122). Tiene la forma acordada para `SessionService`,
 * pero no habla con la API: arranca con datos fijos para poder armar las barras de la 8.7. Faltan
 * `login` y `restore`, que no usa nadie todavía.
 *
 * Para elegir con quién se ve la aplicación, en la consola del navegador, y después recargar:
 *
 *     localStorage.setItem('zolea.demo', 'USER');   // o 'ADMIN'; sin la clave, no hay sesión
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly router = inject(Router);

  readonly user = signal<Me | null>(DEMO_USERS[readStorage('zolea.demo') ?? ''] ?? null);
  readonly isLoggedIn = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');

  token(): string | null {
    return readStorage('zolea.token');
  }

  clear(): void {
    try {
      localStorage.removeItem('zolea.token');
      localStorage.removeItem('zolea.demo');
    } catch {
      // Sin acceso al almacenamiento no hay nada que borrar.
    }
    this.user.set(null);
  }

  logout(): void {
    this.clear();
    void this.router.navigateByUrl('/');
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
