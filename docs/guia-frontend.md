# Guía para consumir la API

Para quien hace el frontend. Está escrita pensando en Angular, pero salvo los ejemplos de código
todo vale para cualquier cliente.

La referencia completa de endpoints es **Swagger**: con el backend corriendo,
`http://localhost:8080/swagger-ui/index.html`. Esta guía cubre lo que Swagger no puede contar —
cómo encajan las piezas.

---

## 1. Levantar el backend

```bash
docker compose up -d db     # MySQL en el puerto 3307
./mvnw spring-boot:run      # backend en el 8080, perfil dev
```

Arranca con la base de demostración cargada: 5 balnearios, 100 unidades y 47 reservas, con las
fechas recalculadas relativas a hoy. **Se recarga en cada arranque**, así que lo que se ensucie
probando se limpia solo al reiniciar.

Cuentas, todas con contraseña `admin123`:

| Cuenta | Rol | Sirve para |
|---|---|---|
| `santi.rodriguez@gmail.com` | `USER` | El recorrido de un cliente |
| `admin.mdp@zolea.com` | `ADMIN` | El panel del balneario de Mar del Plata |

**CORS ya está abierto** para cualquier origen, así que `ng serve` en el 4200 funciona sin
configurar nada.

---

## 2. Iniciar sesión y mantener la sesión

```
POST /api/auth/login    { "email": "...", "password": "..." }
→ { "token": "eyJ...", "clientId": 7, "role": "USER" }
```

El token va en **cada** pedido siguiente:

```
Authorization: Bearer eyJ...
```

**Dura una hora.** Cuando vence, la API responde `401` y hay que volver a iniciar sesión.

### Al recargar la página

El token sobrevive en `localStorage`, pero el resto del estado no. En lugar de guardar el usuario
entero —que puede quedar viejo— pedí:

```
GET /api/auth/me
→ { "idClient": 7, "firstName": "Santiago", "lastName": "Rodríguez",
    "email": "...", "role": "USER", "idManagedResort": null }
```

**No leas el token por dentro** para sacar el rol. Es tentador y funciona, pero acostumbra a tratar
como dato propio algo que el servidor firma para sí mismo: si al usuario le cambian el rol, el
token viejo sigue diciendo lo de antes. `me` contesta con lo que hay en la base ahora.

Para un administrador, `idManagedResort` dice **qué balneario gestiona**. Es el dato que necesita
el panel para saber qué mostrar.

### Interceptor

```ts
// auth.interceptor.ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('token');
  const pedido = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(pedido).pipe(
    catchError((error: HttpErrorResponse) => {
      // 401 = el token venció o falta. El 403 NO: ahí hay sesión, lo que falta es permiso.
      if (error.status === 401) {
        localStorage.removeItem('token');
        inject(Router).navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
```

Distinguir 401 de 403 es lo que evita el error clásico: mandar al login a alguien que **sí** está
logueado y solo intentó abrir algo ajeno.

---

## 3. Los errores

Todos tienen la misma forma, así que se manejan en un solo lugar:

```json
{ "error": "La unidad seleccionada ya está ocupada en ese rango de fechas." }
```

El texto de `error` está escrito para mostrarse tal cual al usuario.

Cuando el pedido trae datos inválidos, se agrega el detalle **por campo**:

```json
{ "error": "Hay datos inválidos en el pedido",
  "campos": { "email": "El email no tiene un formato válido",
              "firstName": "El nombre es obligatorio" } }
```

Las claves de `campos` son los nombres de los campos del pedido, así que se pueden mapear directo
a los controles del formulario.

| Código | Qué pasó | Qué hacer en el frontend |
|---|---|---|
| **400** | Una regla rechazó el pedido | Mostrar `error`, y marcar los controles de `campos` si viene |
| **401** | Falta el token o venció | Limpiar la sesión e ir al login |
| **403** | El recurso existe, pero no es tuyo | Mostrar «no tenés permiso». **No** desloguear |
| **404** | No existe | Pantalla de «no encontrado» |
| **409** | Era válido al comprobarlo y dejó de serlo al guardar | Mostrar `error`: alguien se adelantó |
| **502** | MercadoPago no respondió | Ofrecer reintentar el pago |

---

## 4. Quién puede hacer qué

- Un **cliente** solo accede a sus propias reservas y a su propio perfil. Los ids son consecutivos,
  y pedir el de otro devuelve `403` — no hace falta ocultarlo en la interfaz por seguridad, pero sí
  para no mostrar botones que van a fallar.
- Un **administrador** ve y toca solo **su** balneario: sus unidades, las reservas hechas en ellas y
  los clientes que reservaron ahí. **No existe un administrador que vea todo**: si una cuenta con rol
  ADMIN no tiene balneario asignado, esos tres listados responden `403` con el motivo, en vez de
  devolver el sistema entero.
- `GET /api/clients` devuelve **los clientes de su balneario**, cada uno con su historial en ese
  balneario. Incluye a quienes reservaron por mostrador: esos no tienen cuenta, así que vienen con
  `walkIn: true` y sin `idClient`, `email` ni `phone`. El importe `totalSpent` ya viene sumado por el
  backend — no lo recalcules en el navegador, que es donde se pierden los centavos.
- Al **crear una reserva**, el `clientId` del cuerpo tiene que ser el del usuario del token. Mandar
  otro devuelve `403` en vez de corregirlo en silencio, justamente para que el error se vea.

---

## 5. Reservar y pagar

```
POST /api/bookings        { startDate, endDate, clientId, rentalUnitId, guests: [...] }
→ 201 { "booking": { ... }, "paymentUrl": "https://mercadopago..." }
```

El frontend **redirige** a `paymentUrl`. A partir de ahí el cliente está en el sitio de MercadoPago.

La confirmación llega al backend por dos caminos y **ninguno lo maneja el frontend**: MercadoPago
avisa por su cuenta a `POST /api/bookings/notifications`, y además el navegador vuelve a
`GET /api/bookings/success`, que termina redirigiendo a

```
<FRONTEND_URL>/payment/success?bookingId=123
```

Esa es la pantalla que hay que construir: recibe el `bookingId`, pide `GET /api/bookings/{id}` y
muestra la reserva con sus códigos QR.

**Ojo con el estado en esa pantalla.** Puede llegar antes de que el pago se acredite, así que la
reserva puede figurar todavía como `PENDING`. Conviene mostrar «estamos confirmando tu pago» y
reintentar la consulta unos segundos después, en lugar de dar por fallado lo que solo está
demorado.

Si el pago falla, el cliente vuelve por `/failure`; para reintentar hay
`POST /api/bookings/{id}/pay`, que genera una dirección de pago nueva para la misma reserva.

### Cancelar con reintegro

El reintegro es **simulado**: no se toca MercadoPago. La política se cuenta por días:

| Quién y cuándo | Reintegro |
|---|---|
| El cliente, hasta dos días antes del inicio | 100 % del total |
| El cliente, el día anterior al inicio | 50 % |
| El cliente, desde el día de inicio | No se cancela: `400` «Tu estadía ya empezó: no se puede cancelar.» |
| Una reserva pendiente (sin pagar) | Se cancela sin reintegro |
| El administrador de su balneario | 100 %, antes o durante la estadía |
| Cualquiera, con la estadía ya terminada | No se cancela: `400` «La estadía ya terminó: no se puede cancelar.» |

Antes de confirmar, la pantalla pregunta cuánto se reintegraría hoy, sin cancelar:

```
GET /api/bookings/{id}/cancellation
→ { "canCancel": true, "refundAmount": 15000.00, "refundPercent": 50, "reason": null }
```

Si no se puede, `canCancel` es `false` y `reason` dice por qué. Después,
`PATCH /api/bookings/{id}/cancel` aplica exactamente eso y devuelve la reserva con tres campos más:
`canceledAt`, `canceledBy` (`CLIENT`, `ADMIN` o `SYSTEM`, cuando una pendiente vence sola) y
`refundAmount` (`null` si no estaba pagada). El administrador solo cancela reservas de su
balneario: las de otro responden `403`.

### Detalles que ahorran errores

- **Las fechas incluyen los dos extremos.** Del 15 al 17 son **tres** días, y eso es lo que se
  cobra y lo que queda ocupado. El selector de fechas tiene que contar igual.
- **La plata viene con dos decimales exactos** (`12000.00`). No la pases por `parseFloat` para
  redondearla de nuevo.
- **Los estados de una reserva** son `PENDING`, `CONFIRMED` y `CANCELED`. Una reserva pendiente se
  cancela sola si no se paga en **una hora** desde que se creó (hasta el 07/11 eran 24 horas). El
  link de MercadoPago vence a esa misma hora, también el que se pide de nuevo con
  `POST /api/bookings/{id}/pay`, y no ofrece pagar en efectivo, que acredita días después.
  Pasada la hora, ese pedido responde `400` «La reserva venció.» aunque la limpieza todavía no la
  haya cancelado (corre cada cinco minutos).
- **Una reserva de mostrador** (la carga un administrador para alguien sin cuenta) va por
  `POST /api/bookings/walkin` y se confirma en el acto, sin pasar por MercadoPago.

---

## 6. Ingreso al balneario

Lo hace el **administrador**, desde el panel y con su token, y solo sobre las reservas de **su**
balneario:

```
POST /api/guests/validate/{qrToken}     el código que muestra el huésped
POST /api/guests/validate/dni/{dni}     alternativa si no tiene el código a mano
```

Sin token responde `401`; con una cuenta de cliente, o con el código de una reserva de otro
balneario, `403`. Por DNI busca solo entre las reservas de su balneario: un DNI que tiene reserva en
otro responde `404`, igual que uno que no existe.

El ingreso **se marca como usado**: el mismo código no sirve dos veces, y el segundo intento
devuelve 400 con el motivo. Los mensajes de error están escritos para que el operador los lea tal
cual («la reserva todavía no comenzó, el ingreso se habilita el 20/01/2026»).

---

## 7. Probar la API antes de escribir Angular

La API publica su definición en `http://localhost:8080/v3/api-docs`, y Swagger la dibuja en
`http://localhost:8080/swagger-ui/index.html`.

Cada endpoint trae sus códigos de error documentados y cada pedido trae un ejemplo ya cargado, así
que se puede recorrer todo el flujo desde ahí —iniciar sesión, reservar, validar un ingreso— antes
de escribir una sola línea de Angular. Los tipos de TypeScript se escriben a mano contra esa
definición.
