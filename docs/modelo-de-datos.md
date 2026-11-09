# Modelo de datos

Dos vistas del mismo modelo: el **diagrama de clases**, que es cómo lo ve el código Java, y
el **diagrama entidad-relación**, que es cómo queda en MySQL. Los dos están escritos en
Mermaid, así que GitHub los dibuja solo.

Las tablas las genera Hibernate a partir de las entidades (`spring.jpa.hibernate.ddl-auto`),
no hay scripts de esquema escritos a mano. Lo que se ve acá es lo que hay en la base: se
verificó contra `zolea_db` con `SHOW CREATE TABLE`.

---

## Diagrama de clases

```mermaid
classDiagram
    class Client {
        +Long idClient
        +String firstName
        +String lastName
        +String email
        +String passwordHash
        +String phone
        +String dni
        +String role
    }

    class Resort {
        +Long idResort
        +String name
        +String location
        +String adminEmail
        +String coverPhotoUrl
        +String description
        +boolean isActive
    }

    class RentalUnit {
        +Long idRentalUnit
        +UnitType type
        +String identifier
        +BigDecimal dailyPrice
        +Boolean isBlocked
    }

    class Booking {
        +Long id
        +LocalDate startDate
        +LocalDate endDate
        +BigDecimal totalPrice
        +Status status
        +LocalDateTime createdAt
        +String walkInName
        +String walkInDni
        +occupiedDays() long
        +calculateTotalPrice(BigDecimal) BigDecimal
        +validateDateRange() void
        +confirm() void
        +cancel() void
        +addGuest(String, String) Guest
        +holderDetails() String[]
        +canBeReviewed(LocalDate) boolean
    }

    class Review {
        +Long idReview
        +Integer rating
        +String comment
        +LocalDateTime createdAt
    }

    class Guest {
        +Long idGuest
        +String fullName
        +String dni
        +String qrToken
        +Boolean isEntryValidated
    }

    class Payment {
        +Long idPayment
        +String gatewayPaymentId
        +String status
        +BigDecimal amount
        +LocalDateTime paidAt
        +LocalDateTime recordedAt
    }

    class Amenity {
        +Long idAmenity
        +String name
    }

    class Status {
        <<enumeration>>
        PENDING
        CONFIRMED
        CANCELED
    }

    class UnitType {
        <<enumeration>>
        TENT
        UMBRELLA
    }

    Client "0..1" --> "0..1" Resort : administra
    Resort "1" --> "0..*" RentalUnit : tiene
    Resort "0..*" --> "0..*" Amenity : ofrece
    Client "0..1" --> "0..*" Booking : reserva
    RentalUnit "1" --> "0..*" Booking : se reserva en
    Booking "1" *-- "0..*" Guest : huéspedes
    Booking "1" --> "0..*" Payment : cobros
    Booking "1" <-- "0..1" Review : califica
    Booking ..> Status
    RentalUnit ..> UnitType
```

**Cómo leer las relaciones que no son obvias:**

- **`Client` → `Resort`** es la relación administrador↔balneario. Vive en `Client` porque un
  administrador gestiona un solo balneario, pero un balneario puede tener varios
  administradores. Un cliente común la tiene en `null`.
- **`Booking` → `Guest` es una composición** (el rombo lleno). Los huéspedes no existen fuera
  de su reserva: se crean con ella y se borran con ella (`cascade = ALL`,
  `orphanRemoval = true`). Antes de declararlo así, borrar una reserva dejaba códigos QR
  huérfanos que seguían siendo válidos.
- **`Booking.client` es opcional.** Una reserva de mostrador la carga un administrador para
  alguien que no tiene cuenta: el titular viaja en `walkInName` / `walkInDni`.
- **`Booking` → `Payment`** es de uno a varios y no de uno a uno, porque un cobro que falla y
  se reintenta genera un pago nuevo. De cada pago de la pasarela queda una sola fila:
  `gatewayPaymentId` es único.
- **`Review` → `Booking`** es de uno a uno: una reseña por reserva, y solo de una confirmada
  cuya estadía ya terminó (`canBeReviewed`). La reseña no apunta al balneario ni al cliente:
  llega a los dos a través de la reserva.

**Los métodos que se listan son solo los de `Booking`,** y están ahí porque son el punto del
modelo donde viven las reglas del negocio: cuántos días ocupa una reserva, cuánto sale, qué
rangos de fecha son válidos y a qué estados puede pasar. Las demás entidades son datos.

---

## Diagrama entidad-relación

```mermaid
erDiagram
    CLIENT {
        bigint id_client PK
        varchar first_name
        varchar last_name
        varchar email UK
        varchar password_hash
        varchar phone UK
        varchar dni UK
        varchar role
        bigint id_managed_resort FK
    }

    RESORT {
        bigint id_resort PK
        varchar name
        varchar location
        varchar admin_email UK
        varchar cover_photo_url
        text description
        bit is_active
    }

    RENTAL_UNIT {
        bigint id_rental_unit PK
        varchar type
        varchar identifier
        decimal daily_price
        bit is_blocked
        bigint id_resort FK
    }

    BOOKING {
        bigint id PK
        date start_date
        date end_date
        decimal total_price
        varchar status
        datetime created_at
        varchar walk_in_name
        varchar walk_in_dni
        bigint id_client FK
        bigint id_rental_unit FK
    }

    GUEST {
        bigint id_guest PK
        varchar full_name
        varchar dni
        varchar qr_token UK
        bit is_entry_validated
        bigint id_booking FK
    }

    PAYMENT {
        bigint id_payment PK
        varchar gateway_payment_id UK
        varchar status
        decimal amount
        datetime paid_at
        datetime recorded_at
        bigint id_booking FK
    }

    REVIEW {
        bigint id_review PK
        bigint id_booking FK, UK
        int rating
        varchar comment
        datetime created_at
    }

    AMENITY {
        bigint id_amenity PK
        varchar name
    }

    RESORT_AMENITIES {
        bigint resort_id_resort FK
        bigint amenities_id_amenity FK
    }

    RESORT   ||--o{ RENTAL_UNIT      : "tiene"
    RESORT   ||--o{ CLIENT           : "es administrado por"
    RESORT   ||--o{ RESORT_AMENITIES : ""
    AMENITY  ||--o{ RESORT_AMENITIES : ""
    CLIENT   |o--o{ BOOKING          : "hace"
    RENTAL_UNIT ||--o{ BOOKING       : "se reserva"
    BOOKING  ||--o{ GUEST            : "ingresa con"
    BOOKING  ||--o{ PAYMENT          : "se cobra con"
    BOOKING  ||--o| REVIEW           : "se califica con"
```

### Restricciones de unicidad

Son las reglas que hace cumplir la base, no el código. La diferencia importa: un chequeo
previo en el servicio lo pasan dos peticiones simultáneas, una restricción de la base no.

| Tabla | Restricción | Qué impide |
|---|---|---|
| `client` | `email` único | Dos cuentas con el mismo email |
| `client` | `uk_cliente_telefono` | Dos cuentas con el mismo teléfono |
| `client` | `dni` único | Dos cuentas con el mismo DNI |
| `resort` | `admin_email` único | Dos balnearios con el mismo administrador |
| `rental_unit` | `uk_unidad_por_balneario` (`id_resort`, `identifier`) | Dos carpas «A-01» en el mismo balneario |
| `guest` | `qr_token` único | Dos huéspedes con el mismo código QR |
| `payment` | `uk_pago_de_pasarela` (`gateway_payment_id`) | Que un mismo pago de MercadoPago deje dos filas — y con ellas dos juegos de códigos QR |
| `review` | `uk_resena_de_reserva` (`id_booking`) | Dos reseñas de la misma reserva, aunque los dos pedidos lleguen a la vez |

La última es la que sostiene el cobro: MercadoPago reintenta sus avisos, y dos que lleguen
exactamente a la vez leerían los dos la reserva como pendiente. La explicación completa está
en [decisiones.md](decisiones.md#8-el-pago-se-registra-antes-de-confirmar-la-reserva).

### Lo que no está en la base

- **No hay tabla de usuarios aparte:** `client` es la única. El rol es una columna
  (`role`), con los valores `USER` y `ADMIN`.
- **No hay tabla de sesiones ni de tokens:** la autenticación es JWT sin estado.
- **El esquema no está versionado con Flyway.** Lo genera Hibernate. Ver la decisión 9.
