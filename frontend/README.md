# Frontend de Zolea

La aplicación web de Zolea, en Angular 22. Habla con el backend de este mismo repositorio por HTTP.

## Qué instalar

- **Node 24.** La versión está fijada en `.nvmrc`: con `nvm use` (o `nvm-windows`) tomás la correcta.
- **El backend levantado** en `http://localhost:8080`. Cómo se hace está en el `README.md` de la raíz
  y en el manual de arranque del equipo.

No hace falta instalar el Angular CLI global: se usa el del proyecto, con `npx ng` o los scripts de
`npm`.

## Levantarlo

```bash
cd frontend
npm ci
npm start
```

Queda en `http://localhost:4200`, que es también adonde vuelve el cliente después de pagar en
MercadoPago. `npm ci` instala exactamente las versiones de `package-lock.json`, así los tres
trabajamos con lo mismo.

## Otros comandos

| Comando | Para qué |
|---|---|
| `npm run build` | Compila para producción, en `dist/` |
| `npm test` | Corre las pruebas con Vitest |
| `npx prettier --write src` | Le da al código el formato acordado |

## Dónde va cada cosa

```
src/app/
  core/      lo que existe una sola vez: sesión, interceptor, guards, errores y modelos de la API
  shared/    lo que se repite: botón, campo, aviso, los cuatro estados y el plano del balneario
  layout/    las dos estructuras de página: barra superior y barra lateral
  features/  una carpeta por épica: auth, resorts, bookings, admin y entry
src/styles/tokens.css   colores y medidas del sistema de diseño: la única fuente
src/environments/       la dirección del backend en desarrollo y en producción
```

Una feature no importa nada de otra: si algo lo usan dos, va a `shared/` o a `core/`. El porqué
está en la decisión 16 de `docs/decisiones.md`.
