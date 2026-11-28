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

Arranca con la base de demostración cargada: 5 balnearios, 114 unidades y 74 reservas, con las
fechas recalculadas relativas a hoy. **Se recarga en cada arranque**, así que lo que se ensucie
probando se limpia solo al reiniciar.

Cuentas, todas con contraseña `admin123`:

| Cuenta | Rol | Sirve para |
|---|---|---|
| `santi.rodriguez@gmail.com` | `USER` | El recorrido de un cliente |
| `admin.mdp@zolea.com` | `ADMIN` | El panel del balneario de Mar del Plata |
| `zolea@zolea.com` | `ADMIN`, sin balneario | La cuenta de Zolea: carga el catálogo de servicios y da de alta balnearios |

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

**Una cuenta desactivada** por la cuenta de Zolea (#72) no ingresa: con la contraseña correcta, el
login responde `401` con `"Tu cuenta está desactivada. Escribinos para reactivarla."`; con una
equivocada, el mensaje de siempre, para no revelar qué emails existen. Si tenía la sesión abierta,
su token deja de valer en el pedido siguiente (`401`), aunque no haya vencido.

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
logueado y solo intentó abrir algo que su tipo de cuenta no puede usar.

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
| **403** | Tu tipo de cuenta no puede hacer esto: un cliente en un endpoint de administrador, el administrador de un balneario en algo de la cuenta de Zolea. El texto es siempre el mismo | La página de error 403, «No tenés acceso a esta página». **No** desloguear |
| **404** | No existe, **o no es tuyo**: las dos cosas responden igual, con el mismo texto | La página de error 404, «No encontramos esta página». Nunca decir de quién es |
| **409** | Era válido al comprobarlo y dejó de serlo al guardar | Mostrar `error`: alguien se adelantó |
| **502** | MercadoPago no respondió | Ofrecer reintentar el pago |

**Desde el 26/11, lo ajeno responde como lo que no existe.** Antes, una reserva de otro respondía
`403` y una que no existe, `404`: probando números se sabía qué reservas había. Ahora la pantalla
no puede distinguirlos, y no tiene que intentarlo.

Un pedido mal armado nunca responde `500` (RNF06): un id que no es un número
(`GET /api/bookings/abc`), un cuerpo que no es JSON válido, un parámetro obligatorio que falta o un
valor fuera de una lista cerrada (`"type": "CABANA"`) responden `400` con el motivo en `error`; si
es una lista cerrada, el mensaje trae los valores posibles. Un `500` es siempre un error nuestro.

---

## 4. Quién puede hacer qué

- Un **cliente** solo accede a sus propias reservas y a su propio perfil. Los ids son consecutivos,
  y pedir el de otro devuelve `404`, con el mismo texto que uno que no existe — no hace falta
  ocultarlo en la interfaz por seguridad, pero sí para no mostrar botones que van a fallar.
- Un **administrador** ve y toca solo **su** balneario: sus unidades, las reservas hechas en ellas y
  los clientes que reservaron ahí. **No existe un administrador que vea todo**: si una cuenta con rol
  ADMIN no tiene balneario asignado, esos tres listados responden `403`, en vez de devolver el
  sistema entero. Lo de otro balneario responde `404`, igual que lo que no existe: editar,
  desactivar o reactivar otro balneario, ver una reserva de otro balneario, cancelarla, sus
  condiciones de cancelación o su link de pago, tocar o crear una unidad en otro balneario y la
  reserva de mostrador sobre una unidad ajena.
- El **catálogo de servicios** (`POST`, `PUT` y `DELETE` en `/api/amenities`) lo administra solo
  **la cuenta de Zolea**: el ADMIN sin balneario (`zolea@zolea.com` en la demo). El administrador
  de un balneario recibe `403`, con el texto genérico, y elige los que ofrece en
  `PUT /api/resorts/my`, con `amenityIds`. Listar el catálogo sigue siendo público.
- **Mi balneario** (`PUT /api/resorts/my`) manda el formulario entero: la descripción se reemplaza
  siempre, y vacía se borra. `coverPhotoUrl` ya no está en el formulario: sin el campo queda la
  dirección que había, y vacío la borra. `PUT /api/resorts/{id}` es parcial: lo que llega vacío o
  no viene se conserva. Las fotos van aparte (ver «Fotos del balneario», más abajo).
- **Los balnearios** son de la cuenta de Zolea (#71), en la pantalla Balnearios
  (`/admin/resorts`). El administrador de un balneario recibe `403` en el listado y en el alta.
  - `GET /api/resorts/all`: todos, activos e inactivos, ordenados por nombre, con su
    administrador (`admin`, o `null` si no tiene) y `unitCount`, sin las unidades dadas de baja.
  - `POST /api/resorts`: da de alta el balneario **junto con su administrador**. Lleva `name`,
    `location` y opcionalmente `coverPhotoUrl`, `description` y `amenityIds`, más `admin` con
    `firstName`, `lastName`, `email`, `phone`, `dni` (7 u 8 números) y `password` (provisoria).
    Crea la cuenta ADMIN con ese balneario asignado, que ingresa con esa contraseña y ve su Mi
    balneario. Los errores de un campo del administrador van en `campos` como `admin.email`; un
    email, teléfono o DNI que ya es de otra cuenta responde `409` con el campo.
  - `PUT /api/resorts/{id}/inactive` y `/active`: la cuenta de Zolea desactiva y reactiva
    cualquiera; el administrador de un balneario, solo el suyo.
- **Los usuarios** también son de la cuenta de Zolea (#72), en la pantalla Usuarios
  (`/admin/users`, y `/admin/users/{id}` para el detalle). Un cliente y el administrador de un
  balneario reciben `403` en todo `/api/accounts`.
  - `GET /api/accounts?q=&type=&page=&size=`: una página de cuentas (`content`, `page` desde 0,
    `size` hasta 100, `totalElements`, `totalPages`), por apellido y nombre. `q` busca en el nombre,
    el email y el DNI; `type` es `CLIENT`, `RESORT_ADMIN` o `ZOLEA`. Cada fila trae `type`,
    `active` y `managedResort` (`idResort`, `name`, `active`, o `null`).
  - `GET /api/accounts/{id}`: lo mismo más `phone` y `bookingCount`. Las acciones responden la
    cuenta como quedó, con esta forma.
  - `PATCH /api/accounts/{id}/inactive` y `/active`: desactiva y reactiva. Las cuentas no se borran.
  - `PUT /api/accounts/{id}/password` con `{ "password": "..." }`: le pone una contraseña
    provisoria. Responde `204`; vacía, `400` con `campos.password`.
  - `PUT /api/accounts/{id}/managed-resort` con `{ "idResort": 3 }`: la hace ADMIN de ese
    balneario, que ve en Mi balneario. `DELETE` en la misma ruta se lo quita y la vuelve cliente.
  - La cuenta de Zolea no se desactiva ni se cambia el rol a sí misma: `400` con el motivo.
  - **Mi balneario** (`/api/resorts/my`) busca el balneario por el que la cuenta tiene asignado, no
    por el `adminEmail` del balneario: así un balneario puede tener más de un administrador.
  Esa cuenta maneja el catálogo, los balnearios y los usuarios, y nada más: el panel le sigue
  respondiendo `403`.
- En el frontend, la cuenta de Zolea se reconoce por `/me` con `role: ADMIN` e `idManagedResort`
  vacío. Al ingresar va directo a `/admin/amenities`, su barra lateral tiene el catálogo,
  Balnearios y Usuarios, y cualquier otra pantalla de `/admin` le muestra la página 403. El
  administrador de un balneario, en esas tres, ve la página 403 (`adminAreaGuard`).
- Un administrador **no reserva por `POST /api/bookings`**, ni a su nombre: usa la de mostrador. Y
  por `GET /api/clients/{id}`, `PUT /api/clients/{id}` y `GET /api/bookings/client/{id}` solo llega
  a **su propio** perfil: a sus clientes los ve en `GET /api/clients`.
- **Mi cuenta** (`PUT /api/clients/{id}`) lleva todos los datos; la contraseña, solo si se cambia
  (sin ella, queda la que había). Un email, teléfono o DNI que ya es de otra cuenta responde `409`
  con el campo en `campos` (`email`, `phone` o `dni`), así `toFieldErrors` lo marca debajo. El
  token es del email: si el email cambia, la sesión abierta deja de valer y hay que volver a
  ingresar.
- `GET /api/clients` devuelve **los clientes de su balneario**, cada uno con su historial en ese
  balneario. Incluye a quienes reservaron por mostrador: esos no tienen cuenta, así que vienen con
  `walkIn: true` y sin `idClient`, `email` ni `phone`. El importe `totalSpent` ya viene sumado por el
  backend — no lo recalcules en el navegador, que es donde se pierden los centavos.
- Al **crear una reserva**, el `clientId` del cuerpo tiene que ser el del usuario del token. Mandar
  otro devuelve `404`, como un cliente que no existe, en vez de corregirlo en silencio, justamente
  para que el error se vea.

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
| `minRating` | Los que tienen ese promedio o más, de 1 a 5 (`minRating=4.5`) |
| `stars` | Los de esas estrellas exactas, de 1 a 5: un promedio de 4,0 a 4,9 cuenta como 4 |
| `sort=rating` | No saca a nadie: ordena por promedio, de mayor a menor; a igual promedio, el de más reseñas. Los que no tienen reseñas van al final |

Con cualquier filtro aparecen solo los balnearios que tienen **al menos una unidad** no bloqueada
que cumpla el tipo y el precio y, si vinieron fechas, esté libre en esas fechas. Cuando se buscó
con fechas, `availableUnits` dice cuántas unidades cumplen; sin fechas es `null`, igual que en
`GET /api/resorts/{id}`.

El puntaje y el orden (#73) se aplican sobre ese resultado, con el promedio que trae cada balneario
en `averageRating`, con un decimal: es el mismo número que muestra la tarjeta. Un balneario sin
reseñas no pasa `minRating` ni `stars`. Un `minRating` o unas `stars` fuera de 1 a 5, o un `sort` que
no es `rating`, responden `400` con el motivo.

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
balneario: las de otro responden `404`, como si no existieran.

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
→ 201 { "author": "Santiago R.", "rating": 5, "comment": "...", "createdAt": "2026-01-12T18:30:00", "updatedAt": null }
```

Después, su autor la puede **editar**: Mis reservas muestra «Editar reseña» en las que tienen
`reviewed` en `true`. El diálogo trae la reseña guardada y la reemplaza; la fecha en que se calificó
no cambia y `updatedAt` dice cuándo se editó (el balneario la muestra como «editada»):

```
GET /api/bookings/{id}/review
→ 200 { "author": "Santiago R.", "rating": 3, "comment": "...", "createdAt": "...", "updatedAt": null }

PUT /api/bookings/{id}/review      { "rating": 5, "comment": "..." }
→ 200 { ..., "rating": 5, "updatedAt": "2026-01-14T09:15:00" }
```

Las dos responden `404` si la reserva todavía no se calificó, y validan igual que calificar.

Solo la califica su dueño, y solo si es un cliente: la de otro cliente responde `404`, como si no
existiera, y un administrador recibe `403` —también el del balneario, y aunque la reserva figure a su
nombre—. Los rechazos:

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
administrador de su balneario; el de otro recibe `404`, como si no existiera. Darla de baja otra
vez no hace nada.

**Reservas por delante.** Para el administrador, cada unidad de `GET /api/rental-units` (y la que
devuelven crear, cambiar el precio, bloquear y dar de baja) trae cuántas reservas tiene por delante
y el primer día desde hoy en que está reservada:

```
{ "idRentalUnit": 23, ..., "upcomingBookings": 2, "nextBookingDate": "2026-12-14" }
```

Cuentan las pendientes y las confirmadas que terminan hoy o después; las canceladas y las que ya
terminaron, no. Si una ya empezó, `nextBookingDate` es hoy. Sin reservas por delante,
`upcomingBookings` es `0` y `nextBookingDate`, `null`. Bloquear no las toca: siguen valiendo. Para
un cliente y en la ficha pública, los dos campos vienen en `null`.

### Fotos del balneario (administrador)

El administrador sube, ordena y borra las fotos de **su** balneario, que sale de la sesión:

```
POST   /api/resorts/my/photos          multipart, una o varias en la parte "files"  → 201 [fotos]
PUT    /api/resorts/my/photos/order    { "photoIds": [12, 10, 11] }                 → 200 [fotos]
DELETE /api/resorts/my/photos/{id}                                                 → 204
GET    /api/resorts/{id}/photos/{photoId}                          (público, la imagen)
```

- Van **jpg, png o webp, de hasta 5 MB** cada una, y el balneario tiene **hasta 10**. El tipo se
  mira en el archivo, no en la extensión. Si una no sirve, no se guarda ninguna y responde `400`
  con cuál y por qué (««playa.gif» no es una foto jpg, png o webp.»). Conviene revisarlas antes de
  mandarlas, para decirle al administrador cuáles no van sin perder las que sí.
- Subir y ordenar devuelven **todas** las fotos del balneario, en su orden: `[{ idPhoto, url }]`.
- El orden lleva todas las fotos, cada una una vez; si falta, sobra o se repite una, `400` (pasa si
  se subió o se borró una en otra pestaña: volvé a traer el balneario).
- Borrar una foto de otro balneario, o una que ya no está, responde `404`.
- Una cuenta que no es administrador de un balneario recibe `403`; la cuenta de Zolea también.

Cada balneario (`GET /api/resorts`, `GET /api/resorts/{id}` y `GET /api/resorts/my`) trae `photos`,
en su orden, y la **primera es la portada**: `coverPhotoUrl` es su `url`. Sin fotos, `photos` viene
vacía y `coverPhotoUrl` sigue siendo la dirección que el balneario tenía cargada. La `url` es
completa y pública, con caché larga: se pone tal cual en un `<img>`, que no manda el token.

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

Sin token responde `401`; con una cuenta de cliente, `403`. El código de una reserva de otro
balneario responde `404`, igual que un código que no existe. Por DNI busca solo entre las reservas de
su balneario: un DNI que tiene reserva en otro responde `404`, igual que uno que no existe.

El código —y el DNI— sirven para entrar **todas las veces que haga falta mientras dura la
estadía**: responde `200` cada vez que la reserva está confirmada y hoy (el día de Buenos Aires)
está entre la fecha de inicio y la de fin, las dos incluidas. Volver a escanear el mismo QR, el
mismo día o al siguiente, sale en verde.

Responde `400` con el motivo cuando la reserva no está pagada, todavía no empezó o ya terminó; `404`
si el código no existe. Los mensajes de error están escritos para que el operador los lea tal cual
(«la reserva todavía no comenzó, el ingreso se habilita el 20/01/2026»).

Cada ingreso guarda la fecha y la hora. En la reserva, cada persona de `guests` trae:

```
{
  "idGuest": 12,
  "fullName": "Lucía Gutiérrez",
  "dni": "40123456",
  "isEntryValidated": true,                  ← entró HOY
  "lastEntryAt": "2026-01-10T10:00:00",      ← la última vez, en hora de Buenos Aires; null si nunca entró
  "qrToken": "…"
}
```

`isEntryValidated` quiere decir **«entró hoy»**: al día siguiente vuelve a `false` hasta que se
valide de nuevo, y `lastEntryAt` sigue con el último ingreso. En el Panel, `today.checkedIn` cuenta a
las personas que entraron hoy.

**El registro de ingresos (GH-76).** Cada validación exitosa deja una fila: escanear dos veces la
misma entrada son dos ingresos. `isEntryValidated` y `lastEntryAt` salen de ese registro. Para que
quede anotado cómo se validó, el código escrito a mano se manda con `?typed=true`
(`POST /api/guests/validate/{qrToken}?typed=true`); sin el parámetro queda como QR.

```
GET /api/bookings/{id}/entries              los ingresos de una reserva (admin de su balneario o cliente dueño)
GET /api/resorts/my/entries?date=AAAA-MM-DD los del día en el balneario del admin; sin date, hoy
```

Los dos devuelven una lista, del más nuevo al más viejo:

```
{
  "id": 2063,
  "idGuest": 63,
  "fullName": "Lucía Gutiérrez",
  "bookingId": 62,
  "rentalUnitIdentifier": "B-02",
  "enteredAt": "2026-01-10T10:12:00",   ← en hora de Buenos Aires
  "method": "QR"                        ← QR, CODE (escrito a mano) o DNI
}
```

Una reserva sin ingresos devuelve `[]`. Una ajena, `404`, igual que una que no existe.

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
