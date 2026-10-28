import { describe, it, expect } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, submit } from '@angular/forms/signals';
import { toUserMessage, toFieldErrors } from './error-message';

describe('Error Utilities', () => {
  describe('toUserMessage', () => {
    it('debería devolver el mensaje de error del backend si existe', () => {
      const err = new HttpErrorResponse({
        error: { error: 'El email ya está registrado' },
      });
      expect(toUserMessage(err)).toBe('El email ya está registrado');
    });

    it('debería manejar status 0', () => {
      const err = new HttpErrorResponse({ status: 0 });
      expect(toUserMessage(err)).toBe('No hay conexión con el servidor.');
    });

    it('debería manejar status 401', () => {
      const err = new HttpErrorResponse({ status: 401 });
      expect(toUserMessage(err)).toBe('Tu sesión venció. Volvé a ingresar.');
    });

    it('debería manejar status 403', () => {
      const err = new HttpErrorResponse({ status: 403 });
      expect(toUserMessage(err)).toBe('No tenés permiso para ver esto.');
    });

    it('debería manejar status 404', () => {
      const err = new HttpErrorResponse({ status: 404 });
      expect(toUserMessage(err)).toBe('No encontramos lo que buscabas.');
    });

    it('debería manejar status 502', () => {
      const err = new HttpErrorResponse({ status: 502 });
      expect(toUserMessage(err)).toBe('MercadoPago no respondió. Probá de nuevo en unos minutos.');
    });

    it('debería devolver mensaje genérico por defecto', () => {
      const err = new HttpErrorResponse({ status: 500 });
      expect(toUserMessage(err)).toBe('Algo salió mal. Probá de nuevo.');
    });
  });

  describe('toFieldErrors', () => {
    const createForm = () =>
      TestBed.runInInjectionContext(() =>
        form(signal({ email: 'santi.rodriguez@gmail.com', password: 'admin123' })),
      );

    const badRequest = (campos?: Record<string, string>) =>
      new HttpErrorResponse({ status: 400, error: { error: 'Datos inválidos', campos } });

    it('después de submit, cada campo trae su error server', async () => {
      const f = createForm();

      await submit(f, async () =>
        toFieldErrors(f, badRequest({ email: 'El email ya está en uso' })),
      );

      expect(f.email().errors()).toEqual([
        expect.objectContaining({ kind: 'server', message: 'El email ya está en uso' }),
      ]);
      expect(f.password().errors()).toEqual([]);
    });

    it('sin campos en la respuesta no devuelve errores', () => {
      const f = createForm();

      expect(toFieldErrors(f, badRequest())).toEqual([]);
      expect(toFieldErrors(f, new HttpErrorResponse({ status: 0 }))).toEqual([]);
    });

    it('un campo que no está en el formulario no rompe nada', async () => {
      const f = createForm();
      const err = badRequest({ dni: 'DNI inválido', email: 'El email ya está en uso' });

      await submit(f, async () => toFieldErrors(f, err));

      expect(toFieldErrors(f, err)).toHaveLength(1);
      expect(f.email().errors()).toHaveLength(1);
    });
  });
});
