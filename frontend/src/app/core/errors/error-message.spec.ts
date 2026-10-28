import { describe, it, expect } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { toUserMessage, applyFieldErrors } from './error-message';

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

  describe('applyFieldErrors', () => {
    const createForm = () =>
      new FormGroup({
        email: new FormControl('santi.rodriguez@gmail.com', Validators.required),
        password: new FormControl(''),
      });

    it('debería setear errores "server" y marcar como tocados', () => {
      const form = createForm();
      const err = new HttpErrorResponse({
        error: {
          error: 'Datos inválidos',
          campos: { email: 'El email ya está en uso' },
        },
      });

      applyFieldErrors(form, err);

      expect(form.controls.email.errors).toEqual({ server: 'El email ya está en uso' });
      expect(form.controls.email.touched).toBe(true);

      expect(form.controls.password.errors).toBeNull();
      expect(form.controls.password.touched).toBe(false);
    });

    it('debería conservar los errores que el control ya tenía', () => {
      const form = createForm();
      form.controls.email.setValue('');
      const err = new HttpErrorResponse({
        error: { error: 'Datos inválidos', campos: { email: 'El email es obligatorio' } },
      });

      applyFieldErrors(form, err);

      expect(form.controls.email.errors).toEqual({
        required: true,
        server: 'El email es obligatorio',
      });
    });

    it('no debería mutar nada si la respuesta no trae campos', () => {
      const form = createForm();
      const err = new HttpErrorResponse({ error: { error: 'Error general' } });

      expect(() => applyFieldErrors(form, err)).not.toThrow();
      expect(form.controls.email.errors).toBeNull();
    });

    it('no debería romper si el campo no existe en el form', () => {
      const form = createForm();
      const err = new HttpErrorResponse({
        error: { error: 'Error', campos: { dni: 'DNI inválido' } },
      });

      expect(() => applyFieldErrors(form, err)).not.toThrow();
    });
  });
});
