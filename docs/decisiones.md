# Decisiones de arquitectura

Cada decisión dice **qué problema resolvía**, **qué se eligió** y **qué se paga por elegir
eso**. La última parte es la que importa en una defensa: una decisión sin costo conocido
suele ser una decisión que no se tomó.

El orden es temático, no cronológico.

---

## 1. La autenticación es JWT sin estado

**Problema.** El backend tiene que saber quién hace cada pedido, y el frontend corre en otro
dominio (Vercel contra un túnel ngrok en desarrollo).

**Decisión.** Un JWT firmado que viaja en el header `Authorization: Bearer`, con el email en
`sub` y el rol en un claim. El servidor no guarda sesiones:
`SessionCreationPolicy.STATELESS`, sin cookies y con CSRF deshabilitado.

**Por qué.** Con cookies de sesión haría falta que el navegador las mande entre dominios
distintos, lo que arrastra CORS con credenciales, `SameSite` y protección CSRF. El token en
un header no tiene nada de eso, y el backend puede escalar a varias instancias sin
almacenamiento compartido de sesiones.

**Lo que se paga.** **No hay forma de revocar un token antes de que venza.** Si alguien se
roba uno, sirve hasta que expire —una hora—. Revocarlos exigiría una lista de tokens
invalidados en el servidor, que es exactamente el estado que esta decisión evita. Para un
sistema con dinero real habría que agregarla; a esta escala, la expiración corta alcanza.

**Consecuencia de diseño.** El rol se lee **de la base en cada pedido**, no del token. Si un
administrador deja de serlo, el cambio tiene efecto en el pedido siguiente en lugar de
esperar a que venza su token.

---

## 2. Los endpoints hablan DTOs, no entidades

**Problema.** Devolver las entidades JPA directamente es lo más corto de escribir.

**Decisión.** Cada agregado tiene sus `record` de entrada y de salida (`dtos/`), y los
controllers no exponen ni reciben entidades.

**Por qué.** Tres motivos concretos, no de estilo:

1. **Se filtraban datos.** `Client` tiene `passwordHash`; `Guest` tiene `qrToken`, que es lo
   que abre el molinete. Serializar la entidad los publica.
2. **Las relaciones bidireccionales serializadas se llaman en círculo:** reserva → cliente →
   reservas → …
3. **El JSON deja de ser un contrato.** Renombrar un campo de la entidad rompería el frontend
   sin que nada avise.

**Lo que se paga.** Código de mapeo: un DTO de 15 campos que hay que llenar a mano. Se evitó
lo peor —que ese mapeo estuviera escrito dos veces— dejando un único método por agregado.

---

## 3. Se entra con el QR, pero también con el DNI

**Problema.** El código QR es un `UUID` que el cliente recibe al confirmar. Si llega al
balneario sin batería en el celular, no entra.

**Decisión.** Dos endpoints de validación: por token y por DNI
(`POST /api/guests/validate/{token}` y `/validate/dni/{dni}`).

**Por qué.** Es un balneario, no un aeropuerto: el operador tiene la lista delante y el
huésped está parado frente a él. Negarle la entrada a alguien que pagó, porque se le apagó el
teléfono, es un problema peor que el que el QR resuelve.

**Lo que se paga.** El DNI es adivinable —tiene ocho dígitos—, así que el endpoint por DNI es
más débil que el del token. Se acota con dos cosas: solo valida si la reserva está confirmada
y dentro de su ventana de fechas, y cada ingreso se marca como usado, así que un DNI acertado
sirve una sola vez y deja al titular real sin entrar, que es un problema visible en el
momento. Un sistema con más exposición pondría un límite de intentos por IP.

---

## 4. Las reglas del negocio viven en la entidad, no en el servicio

**Problema.** `Booking`, `Guest` y `RentalUnit` no tenían un solo método propio: eran bolsas
de campos que el servicio modificaba desde afuera. Las reglas quedaban repartidas, duplicadas
o simplemente delegadas al frontend — la unidad bloqueada, por ejemplo, la escondía React y
el backend la aceptaba igual.

**Decisión.** `Booking` sabe cuántos días ocupa, cuánto sale, si su rango es válido y a qué
estados puede pasar: `occupiedDays()`, `calculateTotalPrice(...)`, `validateDateRange()`,
`confirm()`, `cancel()`, `addGuest(...)`, `holderDetails()`. Los cinco `setStatus(...)`
sueltos que había en el servicio quedaron en uno.

**Por qué.** Una regla escrita en un solo lugar no se puede contradecir. El caso testigo es el
precio: se calculaba con un criterio de fechas y la disponibilidad se consultaba con otro, así
que una reserva del 10 al 11 cobraba un día y bloqueaba dos.

**Lo que se paga.** La entidad deja de ser un objeto de datos plano, y hay que tener cuidado
de que no empiece a depender de servicios o repositorios. La regla que se sigue es: la entidad
decide con lo que tiene adentro, y cualquier cosa que necesite ir a la base se queda en el
servicio.

---

## 5. Contra la doble reserva va un candado sobre la unidad

**Problema.** El sistema preguntaba «¿está libre?» y después guardaba. Dos personas reservando
la misma carpa al mismo tiempo pasaban las dos la pregunta y guardaban las dos.

**Decisión.** Antes de consultar la disponibilidad se toma un candado de escritura
(`PESSIMISTIC_WRITE`) sobre la fila de `rental_unit`. La segunda petición espera, y cuando
entra ya ve la reserva de la primera.

**Por qué no las alternativas:**

- **Un `UNIQUE` en la base** no sirve: atraparía dos rangos idénticos, pero el problema son dos
  rangos distintos que se pisan — del 10 al 15 y del 12 al 14.
- **Bloqueo optimista (`@Version`)** tampoco: compara versiones de una fila que las dos
  peticiones modifican, y acá las dos filas de `booking` todavía no existen. No hay nada en
  común que versionar.
- **La unidad sí existe y es lo que las dos se disputan.** Por eso el candado va ahí.

**Lo que se paga.** Se serializan las reservas de la misma unidad. A esta escala es
irrelevante, y solo afecta a las peticiones que compiten por la misma unidad.

**Cómo se verifica.** `ConcurrentBookingTest` lanza dos hilos con un `CountDownLatch` y
comprueba que quede una sola reserva. Una prueba que llamara al método dos veces seguidas
pasaría incluso con el error presente, porque la segunda llamada ya vería la primera reserva.

---

## 6. Las fechas son con fin inclusivo

**Problema.** Convivían dos criterios: el precio contaba la resta entre las dos fechas (fin
exclusivo) y la disponibilidad contaba los dos extremos (fin inclusivo). Una reserva de un
solo día salía **$0**, y MercadoPago rechaza un cobro de cero.

**Decisión.** Fin **inclusivo** en todo el sistema: si reservás del 10 al 12, son tres días,
los mismos tres que quedan bloqueados. `occupiedDays()` es `DAYS.between(inicio, fin) + 1`.

**Por qué.** Es lo que espera el cliente que reserva «del 10 al 12», y hace que el precio y la
disponibilidad hablen de lo mismo. Cuál de los dos criterios se elige importa menos que
elegir uno solo.

**Lo que se paga.** Los datos de demostración tenían el precio calculado con el criterio
viejo, así que `data-demo.sql` se corrigió en el mismo cambio. Si el seed calculara distinto
que la aplicación, los precios de la demo dirían una cosa y una reserva nueva sobre la misma
unidad diría otra.

---

## 7. La plata es `BigDecimal`, no `double`

**Problema.** `double` no representa exactamente los decimales de base 10. Tres días a
$8.500,10 devolvían `25500.300000000003`, y ese número era el que se le mandaba a la pasarela
—encima con `new BigDecimal(double)`, el constructor que copia el error binario en vez de
redondearlo—.

**Decisión.** `BigDecimal` con `@Column(precision = 12, scale = 2)` en los dos campos de
dinero, y una única definición de la escala (`Booking.MONEY_SCALE = 2`). Los importes se
normalizan **al entrar**, no al salir.

**Lo que se paga.** `BigDecimal` es más incómodo: no tiene operadores aritméticos y su
`equals()` compara también la escala, así que `12000` y `12000.00` **no** son iguales aunque
sean el mismo importe. Por eso las pruebas de precio usan `isEqualByComparingTo` y no
`isEqualTo`.

---

## 8. El pago se registra antes de confirmar la reserva

**Problema.** MercadoPago reintenta sus avisos si no recibe respuesta a tiempo, así que el
mismo pago puede llegar varias veces. Que confirmar una reserva ya confirmada no haga nada
—la regla vive en `Booking.confirm()`— alcanza para los avisos que llegan **uno después del
otro**. Para dos que llegan **a la vez**, no: los dos leen la reserva como pendiente y los dos
siguen, y el resultado son dos huéspedes con dos códigos QR para la misma reserva.

**Decisión.** De cada cobro queda una fila en `payment`, con `gateway_payment_id` **único**, y
se escribe **antes** de confirmar la reserva.

**Por qué ese orden.** La fila del pago es lo que marca «este pago ya se procesó». Como el
número es único, dos avisos simultáneos no pueden dejar dos filas: el segundo falla al
insertar y no llega a confirmar nada. La comprobación previa (`existsByGatewayPaymentId`)
sigue estando, pero para evitar la excepción en el caso normal, no como garantía. Es el mismo
razonamiento que el candado de la decisión 5: **una garantía tiene que estar en la base, no
en memoria.**

**Cómo se verificó que la restricción trabaja.** Se desactivó a mano la comprobación previa: la
segunda inserción falla con `Duplicate entry ... for key 'payment.uk_pago_de_pasarela'`.

**De regalo.** Ahora se puede responder «¿esta reserva se pagó, cuánto y cuándo?» con un dato y
no con una inferencia a partir del estado de la reserva.

---

## 9. El esquema lo genera Hibernate; no hay Flyway

**Problema.** El esquema tiene que existir en tres entornos (desarrollo, demostración y
pruebas) y evolucionar junto con las entidades.

**Decisión.** `ddl-auto=update` en desarrollo y demostración, `create-drop` en pruebas. Sin
herramienta de migraciones.

**Por qué.** Es un proyecto académico sin datos de producción que preservar: nadie pierde nada
si hay que recrear la base. Flyway sumaría una dependencia, un directorio de scripts y la
disciplina de escribir una migración por cambio, a cambio de una garantía que acá no hace
falta.

**Lo que se paga, y hay que saberlo.** `update` **agrega** columnas, índices y restricciones,
pero **no borra ni renombra**: una columna eliminada de la entidad se queda en la tabla sin
usarse. Y tiene una trampa que costó encontrar: aplica las restricciones declaradas a nivel
de `@Table` sobre una tabla existente, pero **no** las que van dentro de la definición de una
columna que ya existe. Por eso `client.phone` declara su unicidad en `@Table` y no en
`@Column`: con `@Column` aparecía en las pruebas —donde la tabla se crea de cero— y **no** en
la base de desarrollo. Se detectó consultando `information_schema` después de arrancar la
aplicación, no con las pruebas.

**Cuándo habría que cambiar.** El día que haya datos que no se puedan perder, o que haga falta
renombrar o borrar algo del esquema.

---

## 10. Las pruebas corren contra el MySQL real

**Problema.** Las pruebas de integración necesitan una base. Lo habitual es H2 en memoria.

**Decisión.** El **mismo contenedor MySQL** de `docker-compose`, sobre el schema `zolea_test`,
que se crea solo (`createDatabaseIfNotExist=true`) y se recrea en cada corrida
(`ddl-auto=create-drop`). Los datos de demostración de `zolea_db` no se tocan.

**Por qué.** El seed y varias consultas son MySQL puro: `SET FOREIGN_KEY_CHECKS`,
`UPDATE ... JOIN`, `LPAD`, `CURDATE`. En H2 no corren, o corren distinto. Una prueba que pasa
contra un motor que no es el de producción prueba menos de lo que parece.

**Lo que se paga.** **Las pruebas necesitan Docker levantado.** Si el contenedor está apagado,
fallan con `Communications link failure`, que no es una regresión sino una base ausente. Es
el motivo por el que el flujo de integración continua levanta un servicio MySQL.

---

## 11. Un solo modelo de identidad, y la pertenencia como relación

**Problema.** Había dos modelos de identidad a medias: `Client` con su contraseña, y `Resort`
con un campo `passwordHash` propio que **nadie usaba para autenticar** y que además se
guardaba sin encriptar. La relación entre un administrador y su balneario era un email
guardado como texto (`Resort.adminEmail`).

**Decisión.** `Client` es la única identidad; el rol es una columna. La pertenencia
administrador↔balneario pasó a ser una clave foránea (`Client.managedResort`). El campo de
contraseña de `Resort` se eliminó.

**Por qué una FK en `Client` y no una tabla intermedia.** La cardinalidad que hace falta es
«varios administradores pueden compartir un balneario; un administrador tiene uno solo». Eso
lo cubre una columna. La consulta de permisos queda en un `=` en lugar de un `IN (...)`.

**Lo que se paga.** Si algún día un administrador tiene que gestionar varios balnearios, hace
falta la tabla intermedia. Es un cambio acotado: la regla de acceso está en un solo lugar
(`RentalUnitAccessPolicy`).

---

## 12. La pasarela de pago está detrás de una interfaz propia

**Problema.** El SDK de MercadoPago estaba llamado directamente desde el servicio, así que
«¿cómo se prueba el flujo de reserva sin pegarle a MercadoPago?» no tenía respuesta. Fuera de
los repositorios de Spring Data, el proyecto no tenía ni una interfaz propia.

**Decisión.** `payments/PaymentGateway` declara dos operaciones —crear un cobro y consultar un
pago— y `MercadoPagoGateway` las implementa. Es **el único archivo del proyecto que sabe que
la pasarela es MercadoPago**.

**Por qué.** Además de hacer el flujo probable sin red, es lo que permitió cerrar el agujero de
seguridad del cobro: para no creerle al navegador hay que poder **consultar** el pago, y esa
operación no existía.

**Un detalle deliberado:** `findPayment` devuelve vacío ante **cualquier** problema —un id con
formato raro, un pago inexistente, MercadoPago caído— en lugar de propagar la excepción. Quien
llama decide con eso si confirma, y la regla es **ante la duda no se confirma**.

**Lo que se paga.** Una capa más de indirección, y el riesgo clásico de las abstracciones de
pasarela: que la interfaz termine calcada del proveedor que se abstrajo. Se acotó dejando
solo las dos operaciones que el sistema usa de verdad.

---

## 13. El cobro necesita una dirección HTTPS pública, y por eso hay un túnel

**Problema.** MercadoPago tiene que poder llamar a **nuestro** servidor: cuando el pago se acredita
avisa a `notification_url`, y cuando el cliente termina lo devuelve a las `back_urls`. Las cuatro
direcciones viajan en el pedido con el que se crea el cobro.

Eso impone dos condiciones distintas, que se confunden fácil:

1. **Tiene que ser alcanzable desde internet.** `localhost` existe solo dentro de la máquina.
2. **Tiene que ser HTTPS.** Desde el **29 de marzo de 2025** MercadoPago rechaza con un error 400 las
   preferencias que traigan URLs `http://`, tanto en `back_urls` como en `notification_url`
   ([anuncio oficial](https://www.mercadopago.com.br/developers/en/news/2024/11/14/We-have-updated-the-Preference-API)).

**Decisión.** Las cuatro direcciones se arman a partir de una sola variable, `NGROK_BASE_URL`
(`BookingCheckoutService`), y en desarrollo se apunta a un túnel de ngrok, que da dirección pública y
certificado TLS válido sin instalar nada.

**Por qué el despliegue en EC2 no alcanza por sí solo.** Resuelve la primera condición —la instancia
tiene IP pública— pero no la segunda: una EC2 recién levantada sirve `http://<ip>:8080`, sin
certificado. El certificado que falta es **TLS**, el que convierte `http` en `https`; no tiene
relación con SSH, que es el acceso por consola a la máquina.

**Lo que se paga.** Con la cuenta gratuita de ngrok **la dirección cambia en cada reinicio**, así que
hay que actualizar el `.env` y reiniciar el backend. Es una molestia diaria que se acepta a cambio de
no administrar certificados en un proyecto académico.

**Cómo se saca el túnel de encima, si algún día conviene.** Un dominio apuntando a la instancia y un
Caddy o Nginx delante que obtenga el certificado de Let's Encrypt; o un balanceador de AWS con un
certificado de ACM; o un túnel de Cloudflare, que es gratis y con dirección fija. Las tres exigen
dominio, que es justamente lo que el proyecto no tiene.

**Nota de diseño:** que las cuatro direcciones salgan de **una sola variable** es lo que hace que
cambiar de túnel a dominio sea editar una línea del `.env`.

---

## 14. Las bajas son lógicas, no borrados

**Problema.** En toda la API hay **un solo `@DeleteMapping`**: el de amenidades. Ninguna otra
entidad se puede borrar, y a primera vista parece que falta la «baja» del CRUD.

**Decisión.** Las bajas son **lógicas** y cada entidad tiene la suya, con el nombre del dominio:
un balneario se **desactiva**, una unidad se **bloquea**, una reserva se **cancela**. El borrado
físico existe solo para `Amenity`, que es un catálogo de etiquetas sin historia propia.

**Por qué.** Un balneario tiene reservas; una reserva tiene un pago registrado y códigos QR ya
emitidos. Borrar la fila destruye el registro de algo que ocurrió y movió dinero, que es
justamente lo que la entidad `Payment` existe para conservar.

Hay además una señal concreta dentro del propio código: `deleteAmenity` fallaba con un error de
integridad cuando algún balneario ofrecía ese servicio, y hubo que enseñarle a desvincularse
antes de borrarse. Eso pasa con la entidad **más liviana** del modelo. El mismo problema,
multiplicado por reservas, huéspedes y pagos, es lo que aparecería al borrar un balneario.

Y la baja lógica es **reversible**: un balneario desactivado se reactiva, una unidad bloqueada se
desbloquea. Un `DELETE` no tiene vuelta.

**Lo que se paga.** Las filas no se van nunca, así que las tablas solo crecen y **toda consulta de
lectura tiene que acordarse de filtrar por el estado**: olvidarse de `findByIsActiveTrue` vuelve a
mostrar lo que se había dado de baja — que es exactamente el defecto que tenía `Resort.isActive`
antes de cerrarse. Y en la tabla de verbos HTTP se ve un solo `DELETE`, así que hay que poder
explicar por qué; para eso está escrito esto.

---

## 15. Un administrador sin balneario es un estado inválido, no un administrador que ve todo

**Problema.** Los listados del panel resolvían el balneario así:

```java
idResort != null ? porBalneario(idResort) : todo()
```

Un dato que falta se leía como «mostrale el sistema entero»: las 47 reservas de los cinco
balnearios y las cien unidades. Y no era una hipótesis de laboratorio — el seed deriva la
asignación con `JOIN client c ON c.email = r.admin_email`, coincidencia de texto entre dos
columnas, así que un email que no coincide deja a ese administrador sin balneario y sin aviso.

El comentario que estaba tres líneas más arriba en el propio seed decía que sin balneario «el
listado de unidades vuelve vacío». No era cierto: devolvía las cien. Esa distancia entre lo que se
creía y lo que hacía es el defecto.

**Decisión.** `UserPrincipal.requireManagedResort()` lanza `AccessDeniedException` cuando no hay
balneario, y los tres listados de administrador —reservas, unidades y clientes— lo usan. Sale como
**403** con el motivo.

**Por qué 403 y no una lista vacía.** Las dos opciones son igual de seguras: pasar el `null` a la
consulta tampoco devuelve nada ajeno. La diferencia es que una se puede diagnosticar. Un panel en
blanco manda a revisar el frontend, la sesión y la base antes de sospechar de la asignación; un 403
que dice «el administrador no tiene un balneario asignado» lo resuelve en el primer intento.

**El filtro es por rol, no por dato faltante.** `GET /api/rental-units` lo llaman también los
clientes, y para ellos el `null` es la respuesta correcta: eligen en cualquier balneario. Por eso el
controller pregunta `principal.isAdmin()` antes de exigir el balneario, en vez de negar cuando el
dato viene vacío.

**Lo que se paga.** Una cuenta ADMIN creada a mano sin asignarle balneario queda inutilizable hasta
que alguien la asigne, y ya no hay forma de mirar el sistema completo desde la API. Para este
proyecto es lo correcto: las cuentas de administrador y su balneario están fijos en los datos de
demostración. Si algún día hace falta un rol por encima, es un rol nuevo con sus propias reglas, no
la ausencia de un dato.

**Pendiente conocido.** `POST /api/resorts` **no le asigna el balneario a nadie**: lo crea y listo.
Con esta regla, crear un balneario por la API deja el balneario sin administrador y, del otro lado,
a quien lo iba a administrar sin asignación — o sea, con 403 en todo el panel. No molesta en este
proyecto porque los cinco balnearios y sus administradores están fijos en `data-demo.sql`, pero el
endpoint permite llegar a ese estado. El día que se cierre, la decisión de fondo es quién asigna:
el propio creador, o un alta de administrador aparte.

## 16. El frontend se ordena en cuatro carpetas: core, shared, layout y features

**Problema.** La base del frontend la construyen tres personas en paralelo. Sin una estructura
acordada, cada una inventa la suya: la sesión en una carpeta, el interceptor en otra y tres
versiones del mismo botón.

**Decisión.**

```
frontend/src/app/
  core/      lo que existe una sola vez: sesión, interceptor, guards, manejo de errores y modelos de la API
  shared/    piezas visuales que se repiten: botón, campo, aviso, los cuatro estados y el plano del balneario
  layout/    las dos estructuras de página: la barra superior y la barra lateral
  features/  una carpeta por épica: auth, resorts, bookings, admin y entry
```

Cada carpeta de `features/` tiene sus pantallas y sus propias rutas, y se carga recién cuando se
entra a ella. Una feature no importa nada de otra: lo que dos features necesitan sube a `shared/`
o a `core/`. El plano del balneario, por ejemplo, va a `shared/` porque lo usan la ficha y Reservar.

**Por qué.** Es la convención más común en Angular, así que cualquiera que abra el proyecto se
ubica. `core/` y `shared/` separan lo que tiene una sola instancia de lo que se repite, y
`features/` sigue la misma división que las épicas de Jira: cada tarjeta cae en una carpeta.

**Lo que se paga.** Algunas piezas quedan en el límite y hay que decidir dónde van; la regla es que
si la usa más de una feature, va a `shared/`. Mover algo de una feature a `shared/` cuando aparece
el segundo uso es un cambio chico, pero hay que hacerlo en el momento y no copiarlo.
