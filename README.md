# 🏖️ Zolea

**Sistema de gestión y reservas para balnearios**  
Proyecto académico · Programación 4 · Universidad Tecnológica Nacional (UTN)

---

## ¿Qué es Zolea?

Zolea es una plataforma completa para la administración de balnearios y la reserva de carpas y sombrillas. Los clientes pueden explorar balnearios, elegir su unidad en un mapa interactivo, pagar online con MercadoPago y acceder al balneario con un código QR. Los administradores cuentan con un panel completo para gestionar reservas, unidades, precios y validar el ingreso de huéspedes.

### Sobre esta versión (v2)

Este repositorio es la **segunda versión**, y lo que cambia es el backend: se reescribieron las
reglas del negocio, los permisos, las relaciones entre entidades y el cobro, con 127 pruebas
automáticas que los sostienen. El detalle de qué se arregló y por qué está en
[docs/decisiones.md](docs/decisiones.md).

**El frontend se hace en Angular 22 y vive en `frontend/`, en este mismo repositorio.** Está en
construcción.

La interfaz de la **v1 en React**, que ocupaba esa carpeta, se quitó de acá: ya no funciona contra
este backend —cada administrador ve solo su balneario, `ResortResponse` cambió de campos, los
errores traen el detalle por campo— y sigue publicada en el repositorio del proyecto anterior,
[francejas/BeachG.v2](https://github.com/francejas/BeachG.v2), como referencia de las pantallas.

Para consumir esta API desde el frontend, la guía es
[docs/guia-frontend.md](docs/guia-frontend.md).

---

## 🌐 Demo

Las direcciones de abajo son el despliegue de la **v1**, que sigue en pie. La v2 todavía no
tiene despliegue propio.

| Recurso | URL |
|---|---|
| Frontend de la v1 — despliegue viejo, queda como muestra de las pantallas | [beach-g.vercel.app](https://beach-g.vercel.app) |
| API Swagger (local) | `http://localhost:8080/swagger-ui/index.html` |

---

## ✨ Características

### Para clientes
- Exploración de balnearios con filtros por ciudad y nombre
- **Mapa interactivo** de carpas y sombrillas con selección visual (estilo selector de asientos)
- Reserva online con pago integrado vía **MercadoPago Sandbox**
- Ingreso al balneario con **código QR** generado automáticamente por huésped
- Panel personal con reservas activas, próximas e historial completo
- Visualización del estado de cada reserva (pendiente, confirmada, cancelada)

### Para administradores
- **Dashboard** con métricas en tiempo real: reservas del día, unidades libres, ingresos del mes
- **Widget de clima** en tiempo real (Open-Meteo + Nominatim, sin API key)
- Gestión de unidades: crear, bloquear, actualizar precios individualmente
- **Reservas presenciales (walk-in)** con confirmación y QR instantáneo
- Validación de ingreso por **código QR** o **DNI**
- Historial completo de todas las reservas del balneario

---

## 🛠️ Stack tecnológico

### Backend
| Tecnología | Versión | Rol |
|---|---|---|
| Java | 21 | Lenguaje |
| Spring Boot | 4.0.6 | Framework principal |
| Spring Security + JWT | JJWT 0.12.7 | Autenticación stateless |
| Spring Data JPA / Hibernate | — | ORM y persistencia |
| MySQL | 8.0 | Base de datos relacional |
| MercadoPago SDK | 2.1.23 | Procesamiento de pagos |
| springdoc-openapi | 2.8.6 | Documentación Swagger / OpenAPI 3 |
| Lombok | — | Reducción de boilerplate |
| Docker + Docker Compose | — | Contenerización |

### Frontend (en construcción)
| Tecnología | Versión | Rol |
|---|---|---|
| Angular | 22 | Framework de la interfaz |
| TypeScript | — | Tipado estático |
| SCSS | — | Estilos |

### ☁️ Infraestructura (producción)
| Servicio | Tecnología |
|---|---|
| Frontend | Vercel |
| Backend | AWS EC2 (t3.micro) + Docker Compose |
| Túnel HTTPS | ngrok (para callbacks de MercadoPago) |
| Base de datos | MySQL 8.0 en Docker |

---

## 🏗️ Arquitectura

### Desarrollo local
```
┌─────────────────────────────┐
│   Angular (Puerto 4200)      │
│   Frontend                   │
└──────────────┬──────────────┘
               │ REST + JWT
               ▼
┌─────────────────────────────┐
│  Spring Boot (Puerto 8080)   │
│  Backend                     │
└──────────┬──────────────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
 MySQL 8.0    MercadoPago API
 (Puerto 3307)
```

### Producción
```
┌──────────────────────┐
│  Frontend (Vercel)   │  ← Usuario accede desde browser
│  Angular             │
└──────────┬───────────┘
           │ HTTPS + JWT
           ▼
┌────────────────────────────────────────────────┐
│  germicide-moistness-overhead.ngrok-free.dev   │  ← ngrok (HTTPS)
│               AWS EC2 t3.micro                 │
│                                                │
│  ┌──────────────────┐   ┌──────────────────┐  │
│  │  Spring Boot     │   │   MySQL 8.0      │  │
│  │  Puerto 8080     │   │   Puerto 3307    │  │
│  └──────────────────┘   └──────────────────┘  │
└────────────────────────────────────────────────┘
           │
           ▼
    MercadoPago API
    (callbacks → ngrok → backend → redirect → Vercel)
```

---

## 💳 Flujo de reserva

```
Cliente selecciona balneario
        ↓
Elige unidad en el mapa interactivo
        ↓
Completa datos (fechas + huéspedes)
        ↓
POST /api/bookings → reserva PENDING + paymentUrl de MercadoPago
        ↓
Redirige a MercadoPago Sandbox → el cliente paga
        ↓
        ├─── MercadoPago avisa por su cuenta ────┐
        │    POST /api/bookings/notifications    │   ← no depende del navegador
        │                                        │
        └─── El navegador del cliente vuelve ────┤
             GET /api/bookings/success           │
                                                 ↓
            Se consulta el pago contra MercadoPago:
            ¿existe? ¿aprobado? ¿es de esta reserva?
                                                 ↓
            Se registra el cobro (número único) y se
            confirma la reserva → un QR por huésped
                                                 ↓
Redirige a <FRONTEND_URL>/payment/success?bookingId=X
        ↓
En el balneario: Admin escanea QR o valida por DNI
POST /api/guests/validate/{token}
        ↓
Ingreso validado ✓
```

**Hay dos caminos de confirmación y con cualquiera alcanza.** El aviso automático no depende
de que el cliente vuelva del sitio de MercadoPago; el retorno funciona aunque el aviso se
pierda. Ninguno de los dos confirma por lo que diga la URL: los dos consultan el pago contra
MercadoPago primero. El detalle completo está en [docs/flujo-de-pago.md](docs/flujo-de-pago.md).

---

## 📡 Endpoints de la API

Con el backend corriendo, la documentación interactiva está en:
```
http://localhost:8080/swagger-ui/index.html
```
(La dirección pública de ngrok sirve la misma documentación cuando el túnel está levantado.)

### Referencia rápida

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Obtener JWT |
| `POST` | `/api/clients` | — | Registrar cliente |
| `GET` | `/api/clients` | ADMIN | Los clientes de su balneario, con su historial ahí |
| `GET` | `/api/clients/{id}` | DUEÑO o ADMIN | Perfil del cliente |
| `PUT` | `/api/clients/{id}` | DUEÑO o ADMIN | Actualizar perfil |
| `GET` | `/api/resorts` | — | Listar balnearios |
| `GET` | `/api/resorts/{id}` | — | Detalle + unidades del balneario |
| `GET` | `/api/resorts/my` | ADMIN | Mi balneario |
| `PUT` | `/api/resorts/my` | ADMIN | Actualizar datos del balneario |
| `POST` | `/api/resorts` | ADMIN | Crear balneario |
| `PUT` | `/api/resorts/{id}` | ADMIN | Actualizar balneario por ID |
| `PUT` | `/api/resorts/{id}/inactive` | ADMIN | Desactivar balneario |
| `PUT` | `/api/resorts/{id}/active` | ADMIN | Activar balneario |
| `POST` | `/api/bookings` | AUTH | Crear reserva (flujo MercadoPago) |
| `POST` | `/api/bookings/{id}/pay` | DUEÑO o ADMIN | Reintentar pago (reserva PENDING) |
| `POST` | `/api/bookings/walkin` | ADMIN | Reserva presencial instantánea |
| `GET` | `/api/bookings` | ADMIN | Reservas del balneario del admin |
| `GET` | `/api/bookings/{id}` | DUEÑO o ADMIN | Detalle de reserva |
| `GET` | `/api/bookings/client/{id}` | DUEÑO o ADMIN | Reservas de un cliente |
| `PATCH` | `/api/bookings/{id}/cancel` | DUEÑO o ADMIN | Cancelar reserva |
| `GET` | `/api/bookings/success` | — | Retorno de pago exitoso (MercadoPago) |
| `GET` | `/api/bookings/pending` | — | Retorno de pago pendiente (MercadoPago) |
| `GET` | `/api/bookings/failure` | — | Retorno de pago fallido (MercadoPago) |
| `POST` | `/api/bookings/notifications` | — | Aviso automático de MercadoPago (webhook) |
| `GET` | `/api/rental-units` | AUTH | Listar unidades (el admin ve las de su balneario) |
| `POST` | `/api/rental-units` | ADMIN | Crear unidad |
| `PATCH` | `/api/rental-units/{id}/price` | ADMIN | Actualizar precio |
| `PATCH` | `/api/rental-units/{id}/block` | ADMIN | Bloquear / desbloquear |
| `POST` | `/api/guests/validate/{token}` | — | Validar QR |
| `POST` | `/api/guests/validate/dni/{dni}` | — | Validar por DNI |
| `GET` | `/api/amenities`, `/api/amenities/{id}` | — | Servicios del balneario |
| `POST`, `PUT`, `DELETE` | `/api/amenities` | ADMIN | Administrar servicios |

**DUEÑO o ADMIN** quiere decir que el recurso solo lo ve quien es su titular; un administrador
también, dentro de su balneario. Los endpoints de MercadoPago son públicos porque quien los
llama no tiene el token de la aplicación — y por eso no le creen a lo que les llega.

### Autenticación

```http
Authorization: Bearer <JWT>
```

El JWT se obtiene con `POST /api/auth/login`, dura **una hora** y lleva el email y el rol.

El rol que decide los permisos se lee **de la base en cada pedido**, no del token: si a alguien
se le quita el rol de administrador, el cambio tiene efecto en el pedido siguiente en lugar de
esperar a que venza su token.

---

## 🚀 Instalación y desarrollo local

### Prerrequisitos

- [Docker](https://www.docker.com/) y Docker Compose
- [Node.js 18+](https://nodejs.org/)
- [Java 21](https://adoptium.net/) + Maven (opcional, solo sin Docker)

### 1. Clonar el repositorio

```bash
git clone https://github.com/francejas/Zolea.git
cd Zolea
```

### 2. Configurar variables de entorno

Creá un `.env` en la raíz del proyecto:

```env
# MercadoPago (modo sandbox)
MP_ACCESS_TOKEN=TEST-xxxxxxxxxxxxxxxxxxxx

# URL pública del backend — usá ngrok para desarrollo local
NGROK_BASE_URL=https://xxxx.ngrok-free.app

# URL del frontend — 4200 es el puerto de Angular (3000 era el del frontend de la v1)
FRONTEND_URL=http://localhost:4200

# JWT — usá una clave larga y aleatoria en producción
JWT_SECRET=tu_clave_secreta_muy_larga_aqui
```

### 3. Levantar el backend con Docker

```bash
docker compose up --build
```

Levanta:
- **MySQL 8.0** en `localhost:3307` (con datos de prueba cargados automáticamente)
- **Backend Spring Boot** en `http://localhost:8080`

Para recargar datos de seed sin reconstruir la imagen:

```bash
docker compose up --build -d backend
```

### 4. Correr las pruebas

```bash
docker compose up -d db     # las pruebas necesitan la base levantada
./mvnw test
```

**105 pruebas de integración**, que levantan la aplicación entera contra el MySQL de
`docker-compose` sobre un schema aparte (`zolea_test`), creado y destruido en cada corrida.
Los datos de demostración no se tocan.

Si el contenedor está apagado, fallan con `Communications link failure`: no es una regresión,
falta la base.

Para medir además la cobertura:

```bash
./mvnw verify                          # el informe queda en target/site/jacoco/index.html
```

Todo esto corre solo en cada push a `main` o `develop` y en cada pull request, salvo que el cambio
sea solo del frontend: ver [.github/workflows/ci.yml](.github/workflows/ci.yml). El frontend tiene
el suyo, [.github/workflows/frontend.yml](.github/workflows/frontend.yml).

### 5. (Opcional) Habilitar pagos con MercadoPago en local

MercadoPago necesita una URL pública HTTPS para los callbacks. Usá [ngrok](https://ngrok.com):

```bash
ngrok http 8080
# Copiá la URL HTTPS generada → pegála en NGROK_BASE_URL del .env
# Reiniciá el backend: docker-compose restart backend
```

---

## ☁️ Despliegue en producción

### Backend en AWS EC2

```bash
# Conectarse al servidor
ssh -i clave.pem ubuntu@<IP_EC2>

# Clonar e instalar
git clone https://github.com/francejas/Zolea.git
cd Zolea

# Crear .env con variables de producción y levantar contenedores
sudo docker compose up --build -d

# ngrok (mantener corriendo con nohup)
nohup ngrok http --domain=<tu-dominio-estatico>.ngrok-free.dev 8080 &
```

### Frontend

Se despliega desde `frontend/` a Vercel. Lo único que necesita de este lado es que
`FRONTEND_URL` apunte a su dirección, para que el cliente vuelva ahí después de pagar.

---

## 📁 Estructura del proyecto

```
Zolea/
├── src/main/java/com/zolea/backend/
│   ├── config/               # OpenApiConfig (portada de Swagger), TimeConfig (Clock)
│   ├── controllers/          # AuthController, BookingController, ClientController,
│   │                         # ResortController, RentalUnitController,
│   │                         # GuestController, AmenityController
│   ├── dtos/                 # Request / Response por agregado (records)
│   ├── exceptions/           # GlobalExceptionHandler + excepciones tipadas
│   ├── models/               # Entidades JPA (Client, Resort, RentalUnit, Booking,
│   │                         # Guest, Amenity, Payment) + enums Status y UnitType
│   ├── payments/             # PaymentGateway (puerto) y MercadoPagoGateway
│   ├── repositories/         # Spring Data JPA
│   ├── security/             # JwtUtil, JwtAuthenticationFilter, SecurityConfig,
│   │                         # UserPrincipal y las políticas de acceso
│   ├── services/             # Lógica de negocio
│   └── validation/           # @HolderRequired y su validador
│
├── src/main/resources/
│   ├── application.properties            # común + perfil por defecto (dev)
│   ├── application-dev.properties
│   ├── application-demo.properties
│   └── data-demo.sql         # Seed de dev y demo: 5 balnearios, 25 clientes,
│                             # 100 unidades, 47 reservas
│
├── src/test/                 # 127 pruebas + IntegrationTest (base y fixtures)
├── docs/                     # Modelo de datos, decisiones, flujo de pago y guía de frontend
├── .github/workflows/        # ci.yml (backend) y frontend.yml: compilan y prueban
│
├── frontend/                 # Interfaz en Angular 22 (en construcción)
│
├── docker-compose.yml        # MySQL 8 (3307) + backend (8080, perfil demo)
├── Dockerfile                # Multi-stage build (Maven → JRE)
└── .env                      # Variables de entorno (no se commitea)
```

---

## 🔐 Roles y permisos

| Rol | Acceso |
|---|---|
| Sin autenticar | Landing, explorar balnearios, registro |
| `USER` | Dashboard, crear reservas, ver mis reservas, perfil |
| `ADMIN` | Panel completo: gestión del balneario, unidades, todas las reservas, walk-in, validar QR/DNI |

Un admin solo puede gestionar **su propio balneario** (el asignado en la base de datos).

---

## ⚙️ Variables de entorno — referencia

| Variable | Descripción |
|---|---|
| `MP_ACCESS_TOKEN` | Token de MercadoPago (prefijo `TEST-` para sandbox) |
| `NGROK_BASE_URL` | URL HTTPS pública del backend (callbacks de MercadoPago) |
| `FRONTEND_URL` | URL del frontend, adonde vuelve el cliente después de pagar. Por defecto `http://localhost:4200`, el puerto de Angular |
| `JWT_SECRET` | Clave para firmar JWT (mín. 32 caracteres) |

---

## 📚 Documentación técnica

| Documento | Qué contiene |
|---|---|
| [docs/modelo-de-datos.md](docs/modelo-de-datos.md) | Diagrama de clases, DER y las restricciones de unicidad de la base |
| [docs/decisiones.md](docs/decisiones.md) | Las trece decisiones de arquitectura, con el problema que resolvían y lo que se paga por cada una |
| [docs/flujo-de-pago.md](docs/flujo-de-pago.md) | El cobro paso a paso y por qué hay dos caminos de confirmación |
| [docs/guia-frontend.md](docs/guia-frontend.md) | Para el equipo de frontend: sesión, errores, permisos y cómo generar el cliente de TypeScript |

---

## 👥 Equipo

| Integrante | GitHub |
|---|---|
| Francisco Cejas | [@francejas](https://github.com/francejas) |
| Juan Pablo Bercovsky | [@Berkovv](https://github.com/Berkovv) |
| Facundo Gauthier | [@FacuGauthier](https://github.com/FacuGauthier) |

---

Proyecto académico · Programación 4 · UTN 🎓
