import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'z-field',
  standalone: true,
  template: `
    <div class="z-field-wrapper">
      @if (label()) {
        <label [attr.for]="inputId()" class="z-field-label">{{ label() }}</label>
      }
      
      <!-- El input proyectado va acá. El desarrollador le debe poner el aria-describedby -->
      <ng-content></ng-content>
      
      @if (errorMessage()) {
        <span [id]="errorId()" class="z-field-error" aria-live="polite">
          {{ errorMessage() }}
        </span>
      } @else if (help()) {
        <span [id]="helpId()" class="z-field-help">
          {{ help() }}
        </span>
      }
    </div>
  `
})
export class ZField {
  inputId = input.required<string>();
  label = input<string>();
  help = input<string>();
  
  // Recibe los errores del control (compatible con SignalForms o ReactiveForms)
  errors = input<Record<string, any> | null>(null);
  touched = input(false);

  errorId = computed(() => `${this.inputId()}-error`);
  helpId = computed(() => `${this.inputId()}-help`);

  errorMessage = computed(() => {
    const errs = this.errors();
    if (!errs || !this.touched()) return null;

    if (errs['server']) return errs['server']; // Tarea 8.5
    if (errs['required']) return 'Este campo es obligatorio.';
    if (errs['pattern'] || errs['email']) return 'El formato no es válido.';
    
    return null;
  });
}