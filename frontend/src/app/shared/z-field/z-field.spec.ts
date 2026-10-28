import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { toFieldErrors } from '../../core/errors/error-message';
import { ZField } from './z-field';

@Component({
  imports: [ZField, FormField],
  template: `
    <z-field [field]="f.email" inputId="email" label="Email" help="Con el que vas a ingresar.">
      <input id="email" class="z-input" [formField]="f.email" />
    </z-field>
  `,
})
class Host {
  readonly f = form(signal({ email: '' }), (p) => required(p.email));
}

describe('ZField', () => {
  let fixture: ComponentFixture<Host>;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    page = fixture.nativeElement;
    await fixture.whenStable();
  });

  function field(): HTMLElement {
    return page.querySelector('z-field')!;
  }

  it('sin tocar no muestra el error, y sí la ayuda', () => {
    expect(field().querySelector('.z-field__label')!.textContent).toContain('Email');
    expect(field().querySelector('.z-field__error')).toBeNull();
    expect(field().querySelector('.z-field__hint')!.textContent).toContain('Con el que');
    expect(field().classList).not.toContain('z-field--invalid');
  });

  it('tocado, muestra el mensaje de su primer error', async () => {
    fixture.componentInstance.f.email().markAsTouched();
    await fixture.whenStable();

    const error = field().querySelector('.z-field__error')!;
    expect(error.textContent).toContain('Este campo es obligatorio.');
    expect(error.id).toBe('email-error');
    expect(field().classList).toContain('z-field--invalid');
  });

  it('muestra el error server que devuelve el submit', async () => {
    const { f } = fixture.componentInstance;
    f.email().value.set('santi.rodriguez@gmail.com');
    const err = new HttpErrorResponse({
      status: 400,
      error: { error: 'Datos inválidos', campos: { email: 'El email ya está en uso' } },
    });

    await submit(f, async () => toFieldErrors(f, err));
    await fixture.whenStable();

    expect(field().querySelector('.z-field__error')!.textContent).toContain(
      'El email ya está en uso',
    );
  });
});
