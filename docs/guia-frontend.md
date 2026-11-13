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
| **400** | Una regla rechazó el pedido, o el pedido está mal armado | Mostrar `error`, y marcar los controles de `campos` si viene |
| **401** | Falta el token o venció | Limpiar la sesión e ir al login |
| **403** | El recurso existe, pero no es tuyo | Mostrar «no tenés permiso». **No** desloguear |
| **404** | No existe | Pantalla de «no encontrado» |
| **409** | Era válido al comprobarlo y dejó de serlo al guardar | Mostrar `error`: alguien se adelantó |
| **502** | MercadoPago no respondió | Ofrecer reintentar el pago |

Un pedido mal armado nunca responde `500` (RNF06): un id que no es un número
(`GET /api/bookings/abc`), un cuerpo que no es JSON válido, un parámetro obligatorio que falta o un
valor fuera de una lista cerrada (`"type": "CABANA"`) responden `400` con el motivo en `error`; si
es una lista cerrada, el mensaje trae los valores posibles. Un `500` es siempre un error nuestro.

---

## 4. Quién puede hacer qué

- Un **cliente** solo accede a sus propias reservas y a su propio perfil. Los ids son consecutivos,
  y pedir el de otro devuelve `403` — no hace falta ocultarlo en la interfaz por seguridad, pero sí
  para no mostrar botones que van a fallar.
- Un **administrador** ve y toca solo **su** balneario: sus unidades, las reservas hechas en ellas y
  los clientes que reservaron ahí. **No existe un administrador que vea todo**: si una cuenta con rol
  ADMIN no tiene balneario asignado, esos tres listados responden `403` con el motivo, en vez de
  devolver el sistema entero. Lo mismo al tocar algo por id: editar, desactivar o reactivar otro
  balneario, ver una reserva de otro balneario, sus condiciones de cancelación o su link de pago, y
  la reserva de mostrador sobre una unidad ajena responden `403`.
- Un administrador **no reserva por `POST /api/bookings`**, ni a su nombre: usa la de mostrador. Y
  por `GET /api/clients/{id}`, `PUT /api/clients/{id}` y `GET /api/bookings/client/{id}` solo llega
  a **su propio** perfil: a sus clientes los ve en `GET /api/clients`.
- `GET /api/clients` devuelve **los clientes de su balneario**, cada uno con su historial en ese
  balneario. Incluye a quienes reservaron por mostrador: esos no tienen cuenta, así que vienen con
  `walkIn: true` y sin `idClient`, `email` ni `phone`. El importe `totalSpent` ya viene sumado por el
  backend — no lo recalcules en el navegador, que es donde se pierden los centavos.
- Al **crear una reserva**, el `clientId` del cuerpo tiene que ser el del usuario del token. Mandar
  otro devuelve `403` en vez de corregirlo en silencio, justamente para que el error se vea.

---

## 5. Reservar y pagar

### Buscar dónde hay lugar

La portada usa el listado de siempre, `GET /api/resorts`, con **filtros opcionales**. Sin ninguno
responde igual que antes: todos los balnearios activos, con lugar o sin él.

```
GET /api/resorts?q=mar&from=2027-01-15&to=2027-01-17&type=TENT&maxPrice=20000&amenityIds=1,2
→ [ { "idResort": 1, "name": "...", ..., "averageRating": 4.5, "reviewCount": 12, "availableUnits": 3 }, ... ]
```

| Filtro | Qué deja |
|---|---|
| `q` | Los que tienen ese texto en el nombre o en la ubicación, sin distinguir mayúsculas |
| `from` y `to` | Las dos o ninguna, `AAAA-MM-DD`, desde hoy: una unidad libre en esas fechas |
| `type` | Una unidad `TENT` o `UMBRELLA` |
| `maxPrice` | Una unidad con precio diario hasta ese valor, incluido |
| `amenityIds` | Los que tienen **todos** esos servicios: `amenityIds=1,2` o `amenityIds=1&amenityIds=2` |

Con cualquier filtro aparecen solo los balnearios que tienen **al menos una unidad** no bloqueada
que cumpla el tipo y el precio y, si vinieron fechas, esté libre en esas fechas. Cuando se buscó
con fechas, `availableUnits` dice cuántas unidades cumplen; sin fechas es `null`, igual que en
`GET /api/resorts/{id}`.

En la ficha, el plano marca además las unidades **ocupadas** en las fechas elegidas:

```
GET /api/resorts/{id}/occupied-units?from=2027-01-15&to=2027-01-17
→ [ 12, 15 ]
```

Son los `idRentalUnit` que tienen una reserva pendiente o confirmada que se pisa con esas fechas,
contando los dos extremos. Es la misma regla que aplica el backend al reservar, así que una unidad
que el plano muestra libre se puede reservar. Las bloqueadas no vienen acá: ya están en la ficha,
con `isBlocked`. Los dos endpoints son públicos, sin token.

Los rechazos responden `400` con el motivo en `error`: una sola de las dos fechas (en
`occupied-units` van siempre las dos), `from` después de `to`, `from` antes de hoy, un `type` que
no existe o una fecha que no viene como `AAAA-MM-DD`. Un balneario que no existe, `404`.

Un balneario **desactivado** no aparece en la portada y su ficha, `GET /api/resorts/{id}`, responde
`404` como si no existiera; su administrador lo sigue viendo con `GET /api/resorts/my`. Las unidades
**dadas de baja** no vienen en la ficha ni cuentan en `availableUnits`.

### Reservar

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

Además de los datos inválidos y de la unidad bloqueada u ocupada, reservar —por la web o por
mostrador— responde `400` con el motivo en `error` cuando:

| Caso | Mensaje |
|---|---|
| El inicio es anterior a hoy (el día de Buenos Aires). Hoy todavía se puede | «No se puede reservar para una fecha que ya pasó.» |
| El balneario está desactivado | «Este balneario no está tomando reservas.» |
| La unidad está dada de baja | «La unidad D-01 fue dada de baja.» |

Las reservas que un balneario ya tenía antes de desactivarse siguen como siempre: se pagan, se
cancelan y se validan en la entrada.

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

### El pago en el detalle

`GET /api/bookings/{id}` trae `payments`: cada cobro registrado, el más nuevo primero, y la lista
vacía si no hubo ninguno (una pendiente, una de mostrador).

```
"payments": [
  { "gatewayPaymentId": "1234567890", "amount": 25500.00, "status": "approved", "paidAt": "2026-01-10T10:15:00" }
]
```

`status` es el de MercadoPago, sin traducir, y `paidAt` puede venir en `null` si la pasarela no lo
informó. Si una reserva está **cancelada y tiene un pago aprobado** —el pago que llegó después de
que venciera—, el administrador tiene que reintegrarlo a mano: conviene marcarlo en el detalle.

### Calificar la estadía

Una reseña por reserva, de 1 a 5 y con un comentario opcional de hasta 500 caracteres. Se califica
una reserva **confirmada cuya estadía ya terminó**: el último día todavía es parte de la estadía,
así que se puede desde el día siguiente. Cada reserva trae `reviewed`, que dice si ya se calificó:
Mis reservas muestra «Calificar» en las terminadas que lo tienen en `false`.

```
POST /api/bookings/{id}/review     { "rating": 5, "comment": "..." }
→ 201 { "author": "Santiago R.", "rating": 5, "comment": "...", "createdAt": "2026-01-12T18:30:00" }
```

Solo la califica su dueño, y solo si es un cliente: la de otro cliente responde `403`, también para
el administrador del balneario, y un administrador recibe `403` aunque la reserva figure a su nombre. Los rechazos:

| Caso | Respuesta |
|---|---|
| Todavía no terminó, o no está confirmada | `400` «Vas a poder calificar cuando termine tu estadía.» |
| Ya la calificó | `400` «Ya calificaste esta reserva.» |
| `rating` fuera de 1 a 5, o comentario de más de 500 | `400` con `campos.rating` o `campos.comment` |

Las reseñas de un balneario son **públicas**, sin token, de la más nueva a la más vieja:

```
GET /api/resorts/{id}/reviews
→ [ { "author": "Santiago R.", "rating": 5, "comment": "...", "createdAt": "..." }, ... ]
```

Del autor sale solo el nombre y la inicial del apellido, y `comment` es `null` si no dejó
comentario. Cada balneario (`GET /api/resorts` y `GET /api/resorts/{id}`) trae además
`averageRating`, el promedio con un decimal (`null` si todavía no tiene reseñas), y
`reviewCount`.

### Unidades: bloquear y dar de baja (administrador)

El **bloqueo** es temporal (`PATCH /api/rental-units/{id}/block?isBlocked=true`) y la **baja** es
definitiva:

```
PATCH /api/rental-units/{id}/retire
→ 200 { "idRentalUnit": 23, "identifier": "D-01", ..., "isBlocked": false, "retired": true }
```

Una unidad dada de baja:

- no aparece en la ficha pública ni en el plano, y no se puede reservar;
- no se puede bloquear, desbloquear ni cambiarle el precio: `400`;
- sigue en `GET /api/rental-units` del administrador con `retired: true` (conviene mostrarla aparte
  o atenuada, sin los botones de bloquear y de precio), y sus reservas pasadas quedan como estaban;
- su identificador sigue ocupado: crear otra con el mismo responde `400`.

No se puede dar de baja mientras tenga reservas pendientes o confirmadas que terminan hoy o después:
`400` «Tiene reservas por delante: cancelalas o esperá a que terminen.». Solo la da de baja el
administrador de su balneario; el de otro recibe `403`. Darla de baja otra vez no hace nada.

### Detalles que ahorran errores

- **Las fechas incluyen los dos extremos.** Del 15 al 17 son **tres** días, y eso es lo que se
  cobra y lo que queda ocupado. El selector de fechas tiene que contar igual.
- **La plata viene con dos decimales exactos** (`12000.00`). No la pases por `parseFloat` para
  redondearla de nuevo.
- **Los estados de una reserva** son `PENDING`, `CONFIRMED` y `CANCELED`. Una reserva pendiente tiene
  **una hora** para pagarse desde que se creó (hasta el 07/11 eran 24 horas); si no, se cancela
  sola. El link de MercadoPago vence a esa misma hora, también el que se pide de nuevo con
  `POST /api/bookings/{id}/pay`, y no ofrece pagar en efectivo, que acredita días después.
  Pasada la hora, ese pedido responde `400` «La reserva venció.» aunque la reserva siga figurando
  pendiente: la limpieza la cancela recién entre los 75 y los 80 minutos de creada, para darle
  tiempo a un pago que se aprobó sobre la hora.
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

## 7. Estadísticas del panel

Los números del Panel con gráficos. Los pide el **administrador**, y siempre son de **su**
balneario: sale de la sesión, no de un parámetro.

```
GET /api/resorts/my/stats?from=2026-10-01&to=2026-12-31
→ {
    "from": "2026-10-01", "to": "2026-12-31",
    "today": { "activeBookings": 3, "expectedGuests": 8, "checkedIn": 2,
               "pendingBookings": 2, "freeUnits": 17 },
    "occupancyByDay": [ { "date": "2026-10-01", "occupiedUnits": 5, "totalUnits": 22 }, ... ],
    "incomeByMonth":  [ { "month": "2026-10", "income": 254000.00 }, ... ],
    "topUnits":       [ { "idRentalUnit": 10, "identifier": "B-02", "type": "UMBRELLA", "days": 14 }, ... ]
  }
```

**El rango.** Sin fechas va del primer día del mes pasado al último del mes que viene, y vuelve en
`from` y `to`. Van las dos fechas o ninguna, con el formato `AAAA-MM-DD`, y hasta 366 días contando
los dos extremos. Una sola fecha, `from` después de `to`, un rango más largo o una fecha mal escrita
responden `400`. Sin token, `401`; una cuenta de cliente o un administrador sin balneario, `403`.

**Qué es cada número.** Solo cuentan las reservas **confirmadas**, salvo `pendingBookings`; las
canceladas no suman en ninguno.

- `today` no depende del rango:
  - `activeBookings`, las reservas que incluyen hoy;
  - `expectedGuests`, todas las personas de esas reservas, titular incluido;
  - `checkedIn`, cuántas de esas personas ya tienen la entrada validada;
  - `pendingBookings`, las reservas del balneario que siguen pendientes de pago;
  - `freeUnits`, las unidades no bloqueadas sin una reserva que incluya hoy.

  Con `today` y el mes en curso de `incomeByMonth` se arma el resumen del panel.
- `occupancyByDay`: un elemento por día del rango, también los días en 0. `occupiedUnits` son las
  unidades distintas reservadas ese día; `totalUnits`, las que hoy no están bloqueadas.
- `incomeByMonth`: un elemento por mes que toca el rango, en orden y también los meses en 0. Cada
  reserva suma entera en el mes en que **empieza**: una del 30/10 al 02/11 va toda a octubre. La plata
  viene con dos decimales, como siempre.
- `topUnits`: las 5 unidades con más días reservados dentro del rango, de más a menos y, si empatan,
  por identificador. Si una reserva se sale del rango, cuentan solo los días de adentro, y las
  unidades sin reservas no van.

En la demo, `admin.mdp@zolea.com` tiene reservas el mes pasado, hoy y las semanas que vienen, así
los tres bloques traen números.

---

## 8. Probar la API antes de escribir Angular

La API publica su definición en `http://localhost:8080/v3/api-docs`, y Swagger la dibuja en
`http://localhost:8080/swagger-ui/index.html`.

Cada endpoint trae sus códigos de error documentados y cada pedido trae un ejemplo ya cargado, así
que se puede recorrer todo el flujo desde ahí —iniciar sesión, reservar, validar un ingreso— antes
de escribir una sola línea de Angular. Los tipos de TypeScript se escriben a mano contra esa
definición.
