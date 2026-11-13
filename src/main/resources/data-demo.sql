-- =============================================================================
-- Zolea — Datos de demostración
-- Contraseña de TODOS los usuarios: admin123
-- Hash BCrypt: $2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS
--
-- ESTE SCRIPT BORRA TODAS LAS TABLAS ANTES DE INSERTAR, Y ESO ES A PROPÓSITO:
-- el objetivo es que cada arranque parta del mismo estado conocido para poder
-- probar siempre contra los mismos datos.
--
-- Por eso corre SOLO en los perfiles "dev" y "demo", que son los que declaran
-- spring.sql.init.mode=always y apuntan a este archivo con
-- spring.sql.init.data-locations. El perfil "test" usa mode=never y arma sus
-- propios datos; cualquier perfil futuro que deba preservar datos tampoco lo
-- carga. Se llama data-demo.sql y no data.sql justamente para que Spring no lo
-- levante por convención sin que nadie lo haya decidido.
--
-- Es MySQL puro (SET FOREIGN_KEY_CHECKS, ALTER TABLE AUTO_INCREMENT,
-- UPDATE ... JOIN, LPAD, UTC_TIMESTAMP, variables @): no corre en otro motor.
-- =============================================================================

-- =============================================================================
-- FECHAS Y HORAS
--
-- Las fechas salen del día de Buenos Aires, no del de la base: @today es ese
-- día y se usa en todo el archivo en lugar de CURDATE(). El contenedor de MySQL
-- corre en UTC, y CURDATE() después de las 21 h daba el día siguiente. Argentina
-- no cambia la hora en verano, así que restar 3 horas alcanza. La variable vale
-- en todo el archivo porque Spring corre el script entero en una sola conexión.
--
-- Las horas (created_at, canceled_at) van en UTC, que es como las guarda la
-- aplicación: la conexión lleva serverTimezone=UTC y la aplicación fija su zona
-- en la del balneario al arrancar (BackendApplication), así que la base queda en
-- UTC en cualquier máquina y en Compose. Por eso salen de UTC_TIMESTAMP() y no
-- de NOW(), que depende de la zona de la base. Ver docs/decisiones.md, 17.
-- =============================================================================
SET @today = DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR);

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM review;
DELETE FROM payment;
DELETE FROM guest;
DELETE FROM booking;
DELETE FROM resort_amenities;
DELETE FROM rental_unit;
DELETE FROM amenity;
DELETE FROM resort;
DELETE FROM client;

ALTER TABLE review      AUTO_INCREMENT = 1;
ALTER TABLE payment     AUTO_INCREMENT = 1;
ALTER TABLE guest       AUTO_INCREMENT = 1;
ALTER TABLE booking     AUTO_INCREMENT = 1;
ALTER TABLE rental_unit AUTO_INCREMENT = 1;
ALTER TABLE amenity     AUTO_INCREMENT = 1;
ALTER TABLE resort      AUTO_INCREMENT = 1;
ALTER TABLE client      AUTO_INCREMENT = 1;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- 1. CLIENTES
--    ID 1   : mostrador (walk-in, USER)
--    IDs 2-6: administradores de cada balneario (ADMIN)
--    IDs 7-25: clientes regulares (USER)
-- =============================================================================
INSERT INTO client (id_client, first_name, last_name, email, phone, password_hash, role) VALUES
(1,  'Cliente',    'Mostrador',  'mostrador@zolea.com',         '0000000000', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),

-- Administradores (uno por balneario)
(2,  'Maximiliano','Soria',      'admin.mdp@zolea.com',         '2231000001', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'ADMIN'),
(3,  'Verónica',   'Ríos',       'admin.pinamar@zolea.com',     '2254000002', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'ADMIN'),
(4,  'Hernán',     'Casanova',   'admin.gesell@zolea.com',      '2255000003', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'ADMIN'),
(5,  'Patricia',   'Montiel',    'admin.miramar@zolea.com',     '2291000004', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'ADMIN'),
(6,  'Eduardo',    'Vidal',      'admin.necochea@zolea.com',    '2262000005', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'ADMIN'),

-- Clientes regulares
(7,  'Santiago',   'Rodríguez',  'santi.rodriguez@gmail.com',    '1144001100', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(8,  'Valentina',  'García',     'vale.garcia@gmail.com',        '1144002200', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(9,  'Matías',     'Fernández',  'matias.fern@gmail.com',        '1144003300', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(10, 'Camila',     'Martínez',   'cami.martinez@gmail.com',      '1144004400', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(11, 'Luciano',    'Torres',     'lucho.torres@gmail.com',       '1144005500', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(12, 'Agustina',   'López',      'agus.lopez@gmail.com',         '1144006600', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(13, 'Ramiro',     'Gómez',      'ramiro.gomez@gmail.com',       '1144007700', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(14, 'Florencia',  'Díaz',       'flor.diaz@gmail.com',          '1144008800', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(15, 'Ezequiel',   'Sánchez',    'eze.sanchez@gmail.com',        '2234009900', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(16, 'Natalia',    'Romero',     'nati.romero@gmail.com',        '2234010010', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(17, 'Ignacio',    'Pérez',      'nacho.perez@gmail.com',        '2234011011', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(18, 'Sofía',      'Molina',     'sofi.molina@gmail.com',        '2234012012', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(19, 'Tomás',      'Gutiérrez',  'tomi.gut@gmail.com',           '2234013013', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(20, 'Micaela',    'Flores',     'mice.flores@gmail.com',        '2234014014', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(21, 'Facundo',    'Ruiz',       'facu.ruiz@gmail.com',          '1155015015', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(22, 'Milagros',   'Jiménez',    'mili.jimenez@gmail.com',       '1155016016', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(23, 'Nicolás',    'Acosta',     'nico.acosta@gmail.com',        '1155017017', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(24, 'Rocío',      'Villalba',   'rocio.villalba@gmail.com',     '1155018018', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER'),
(25, 'Sebastián',  'Medina',     'seba.medina@gmail.com',        '1155019019', '$2b$10$2LXClizmmJnOUPX5KDuMbe8.Gwhz0Vx.XHArOa7EwQRDkyGyk.cuS', 'USER');

-- =============================================================================
-- 2. BALNEARIOS (RESORTS)
--    admin_email debe coincidir con el email del cliente ADMIN correspondiente
-- =============================================================================
INSERT INTO resort (id_resort, name, location, admin_email, cover_photo_url, description, is_active) VALUES
(1, 'Zolea Club de Playa',
    'Mar del Plata, Buenos Aires',
    'admin.mdp@zolea.com',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800',
    'El balneario más completo de Mar del Plata. Ubicado en Playa Grande, con sombrillas de primera fila, carpas premium, pileta climatizada y restaurante con vista al mar. Ideal para familias y grupos que buscan comodidad y servicios de calidad a metros del Atlántico.',
    true),

(2, 'Ocean View Resort',
    'Pinamar, Buenos Aires',
    'admin.pinamar@zolea.com',
    'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=800',
    'Experiencia de lujo frente al mar en Pinamar. Carpas VIP con servicio exclusivo, spa, bar de tragos y acceso directo a la playa. Para quienes buscan una escapada premium con todas las comodidades.',
    true),

(3, 'Arena Dorada',
    'Villa Gesell, Buenos Aires',
    'admin.gesell@zolea.com',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800',
    'La playa favorita de Villa Gesell. Ambiente joven y familiar con música en vivo los fines de semana, deportes acuáticos y snack bar. Más de 20 carpas y sombrillas a elegir con los mejores precios de la costa.',
    true),

(4, 'Costa Sur',
    'Miramar, Buenos Aires',
    'admin.miramar@zolea.com',
    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800',
    'La tranquilidad de Miramar con todos los servicios. Playa familiar, guardavidas de temporada, recreación infantil y estacionamiento propio. El destino perfecto para descansar lejos del bullicio.',
    true),

(5, 'Mar del Sur',
    'Necochea, Buenos Aires',
    'admin.necochea@zolea.com',
    'https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=800',
    'Disfrutá de las dunas y el mar en Necochea. Balneario con ambiente natural, kayaks y deportes acuáticos, duchas y vestuarios modernos. La escapada perfecta para los amantes del surf y la naturaleza.',
    true);

-- =============================================================================
-- 3. AMENIDADES (SERVICIOS)
-- =============================================================================
INSERT INTO amenity (id_amenity, name) VALUES
(1,  'WiFi'),
(2,  'Pileta Climatizada'),
(3,  'Estacionamiento'),
(4,  'Restaurante'),
(5,  'Recreación Infantil'),
(6,  'Spa'),
(7,  'Barra de Tragos'),
(8,  'Duchas y Vestuarios'),
(9,  'Deportes Acuáticos'),
(10, 'Guardavidas'),
(11, 'Snack Bar'),
(12, 'Alquiler de Reposeras'),
(13, 'Música en Vivo');

-- =============================================================================
-- 4. VINCULAR AMENIDADES A BALNEARIOS
-- =============================================================================
-- Resort 1 (Zolea, MdP): completo
INSERT INTO resort_amenities (resorts_id_resort, amenities_id_amenity) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 8), (1, 10), (1, 12);

-- Resort 2 (Ocean View, Pinamar): premium / sin niños
INSERT INTO resort_amenities (resorts_id_resort, amenities_id_amenity) VALUES
(2, 1), (2, 3), (2, 4), (2, 6), (2, 7), (2, 8), (2, 10), (2, 12);

-- Resort 3 (Arena Dorada, Villa Gesell): joven y activo
INSERT INTO resort_amenities (resorts_id_resort, amenities_id_amenity) VALUES
(3, 1), (3, 5), (3, 7), (3, 8), (3, 9), (3, 10), (3, 11), (3, 13);

-- Resort 4 (Costa Sur, Miramar): familiar
INSERT INTO resort_amenities (resorts_id_resort, amenities_id_amenity) VALUES
(4, 1), (4, 2), (4, 3), (4, 5), (4, 8), (4, 10), (4, 11), (4, 12);

-- Resort 5 (Mar del Sur, Necochea): naturaleza / surf
INSERT INTO resort_amenities (resorts_id_resort, amenities_id_amenity) VALUES
(5, 3), (5, 8), (5, 9), (5, 10), (5, 11), (5, 12);

-- =============================================================================
-- 5. UNIDADES DE ALQUILER
--    Resort 1 (MdP):    IDs  1–24  (24 unidades)
--    Resort 2 (Pinamar): IDs 25–44  (20 unidades)
--    Resort 3 (Gesell):  IDs 45–64  (20 unidades)
--    Resort 4 (Miramar): IDs 65–84  (20 unidades)
--    Resort 5 (Necochea):IDs 85–100 (16 unidades)
-- =============================================================================

-- ---- Resort 1: Zolea Club de Playa (Mar del Plata) ----
INSERT INTO rental_unit (id_rental_unit, identifier, type, daily_price, is_blocked, id_resort) VALUES
-- Sombrillas - Fila A (primera fila, junto al mar)
(1,  'A-01', 'UMBRELLA',  8500.0, false, 1),
(2,  'A-02', 'UMBRELLA',  8500.0, false, 1),
(3,  'A-03', 'UMBRELLA',  8500.0, false, 1),
(4,  'A-04', 'UMBRELLA',  8500.0, false, 1),
(5,  'A-05', 'UMBRELLA',  8500.0, false, 1),
(6,  'A-06', 'UMBRELLA',  8500.0, false, 1),
(7,  'A-07', 'UMBRELLA',  8500.0, false, 1),
(8,  'A-08', 'UMBRELLA',  8500.0, true,  1), -- bloqueada por mantenimiento
-- Sombrillas - Fila B (segunda fila)
(9,  'B-01', 'UMBRELLA',  7000.0, false, 1),
(10, 'B-02', 'UMBRELLA',  7000.0, false, 1),
(11, 'B-03', 'UMBRELLA',  7000.0, false, 1),
(12, 'B-04', 'UMBRELLA',  7000.0, false, 1),
(13, 'B-05', 'UMBRELLA',  7000.0, false, 1),
(14, 'B-06', 'UMBRELLA',  7000.0, false, 1),
(15, 'B-07', 'UMBRELLA',  7000.0, false, 1),
(16, 'B-08', 'UMBRELLA',  7000.0, false, 1),
-- Carpas Premium - Sector C
(17, 'C-01', 'TENT',      14500.0, false, 1),
(18, 'C-02', 'TENT',      14500.0, false, 1),
(19, 'C-03', 'TENT',      14500.0, false, 1),
(20, 'C-04', 'TENT',      14500.0, false, 1),
(21, 'C-05', 'TENT',      14500.0, false, 1),
(22, 'C-06', 'TENT',      14500.0, false, 1),
-- Carpas Estándar - Sector D
(23, 'D-01', 'TENT',      12000.0, false, 1),
(24, 'D-02', 'TENT',      12000.0, false, 1);

-- ---- Resort 2: Ocean View Resort (Pinamar) ----
INSERT INTO rental_unit (id_rental_unit, identifier, type, daily_price, is_blocked, id_resort) VALUES
-- Sombrillas VIP - Frente al mar
(25, 'U-01', 'UMBRELLA', 13000.0, false, 2),
(26, 'U-02', 'UMBRELLA', 13000.0, false, 2),
(27, 'U-03', 'UMBRELLA', 13000.0, false, 2),
(28, 'U-04', 'UMBRELLA', 13000.0, false, 2),
(29, 'U-05', 'UMBRELLA', 13000.0, false, 2),
(30, 'U-06', 'UMBRELLA', 13000.0, false, 2),
-- Sombrillas Estándar
(31, 'U-07', 'UMBRELLA', 10500.0, false, 2),
(32, 'U-08', 'UMBRELLA', 10500.0, false, 2),
(33, 'U-09', 'UMBRELLA', 10500.0, false, 2),
(34, 'U-10', 'UMBRELLA', 10500.0, false, 2),
(35, 'U-11', 'UMBRELLA', 10500.0, false, 2),
(36, 'U-12', 'UMBRELLA', 10500.0, true,  2), -- bloqueada
-- Carpas Premium
(37, 'T-01', 'TENT',     22000.0, false, 2),
(38, 'T-02', 'TENT',     22000.0, false, 2),
(39, 'T-03', 'TENT',     22000.0, false, 2),
(40, 'T-04', 'TENT',     22000.0, false, 2),
(41, 'T-05', 'TENT',     22000.0, false, 2),
(42, 'T-06', 'TENT',     22000.0, false, 2),
-- Carpas Familiares
(43, 'T-07', 'TENT',     18000.0, false, 2),
(44, 'T-08', 'TENT',     18000.0, false, 2);

-- ---- Resort 3: Arena Dorada (Villa Gesell) ----
INSERT INTO rental_unit (id_rental_unit, identifier, type, daily_price, is_blocked, id_resort) VALUES
(45, 'AG-01', 'UMBRELLA',  9000.0, false, 3),
(46, 'AG-02', 'UMBRELLA',  9000.0, false, 3),
(47, 'AG-03', 'UMBRELLA',  9000.0, false, 3),
(48, 'AG-04', 'UMBRELLA',  9000.0, false, 3),
(49, 'AG-05', 'UMBRELLA',  9000.0, false, 3),
(50, 'AG-06', 'UMBRELLA',  9000.0, false, 3),
(51, 'AG-07', 'UMBRELLA',  9000.0, false, 3),
(52, 'AG-08', 'UMBRELLA',  9000.0, false, 3),
(53, 'AG-09', 'UMBRELLA',  9000.0, false, 3),
(54, 'AG-10', 'UMBRELLA',  9000.0, true,  3), -- bloqueada
(55, 'GC-01', 'TENT',     16000.0, false, 3),
(56, 'GC-02', 'TENT',     16000.0, false, 3),
(57, 'GC-03', 'TENT',     16000.0, false, 3),
(58, 'GC-04', 'TENT',     16000.0, false, 3),
(59, 'GC-05', 'TENT',     16000.0, false, 3),
(60, 'GC-06', 'TENT',     16000.0, false, 3),
(61, 'GC-07', 'TENT',     16000.0, false, 3),
(62, 'GC-08', 'TENT',     16000.0, false, 3),
(63, 'GC-09', 'TENT',     16000.0, false, 3),
(64, 'GC-10', 'TENT',     16000.0, false, 3);

-- ---- Resort 4: Costa Sur (Miramar) ----
INSERT INTO rental_unit (id_rental_unit, identifier, type, daily_price, is_blocked, id_resort) VALUES
(65, 'PM-01', 'UMBRELLA',  7500.0, false, 4),
(66, 'PM-02', 'UMBRELLA',  7500.0, false, 4),
(67, 'PM-03', 'UMBRELLA',  7500.0, false, 4),
(68, 'PM-04', 'UMBRELLA',  7500.0, false, 4),
(69, 'PM-05', 'UMBRELLA',  7500.0, false, 4),
(70, 'PM-06', 'UMBRELLA',  7500.0, false, 4),
(71, 'PM-07', 'UMBRELLA',  7500.0, false, 4),
(72, 'PM-08', 'UMBRELLA',  7500.0, false, 4),
(73, 'PM-09', 'UMBRELLA',  7500.0, false, 4),
(74, 'PM-10', 'UMBRELLA',  7500.0, false, 4),
(75, 'KA-01', 'TENT',     13500.0, false, 4),
(76, 'KA-02', 'TENT',     13500.0, false, 4),
(77, 'KA-03', 'TENT',     13500.0, false, 4),
(78, 'KA-04', 'TENT',     13500.0, false, 4),
(79, 'KA-05', 'TENT',     13500.0, false, 4),
(80, 'KA-06', 'TENT',     13500.0, false, 4),
(81, 'KA-07', 'TENT',     13500.0, false, 4),
(82, 'KA-08', 'TENT',     13500.0, false, 4),
(83, 'KA-09', 'TENT',     13500.0, false, 4),
(84, 'KA-10', 'TENT',     13500.0, true,  4); -- bloqueada

-- ---- Resort 5: Mar del Sur (Necochea) ----
INSERT INTO rental_unit (id_rental_unit, identifier, type, daily_price, is_blocked, id_resort) VALUES
(85,  'NC-01', 'UMBRELLA',  8000.0, false, 5),
(86,  'NC-02', 'UMBRELLA',  8000.0, false, 5),
(87,  'NC-03', 'UMBRELLA',  8000.0, false, 5),
(88,  'NC-04', 'UMBRELLA',  8000.0, false, 5),
(89,  'NC-05', 'UMBRELLA',  8000.0, false, 5),
(90,  'NC-06', 'UMBRELLA',  8000.0, false, 5),
(91,  'NC-07', 'UMBRELLA',  8000.0, false, 5),
(92,  'NC-08', 'UMBRELLA',  8000.0, false, 5),
(93,  'MS-01', 'TENT',     14000.0, false, 5),
(94,  'MS-02', 'TENT',     14000.0, false, 5),
(95,  'MS-03', 'TENT',     14000.0, false, 5),
(96,  'MS-04', 'TENT',     14000.0, false, 5),
(97,  'MS-05', 'TENT',     14000.0, false, 5),
(98,  'MS-06', 'TENT',     14000.0, false, 5),
(99,  'MS-07', 'TENT',     14000.0, false, 5),
(100, 'MS-08', 'TENT',     14000.0, true,  5); -- bloqueada

-- =============================================================================
-- 6. RESERVAS
--    Tipos:
--      - CONFIRMED + fechas pasadas: temporada dic 2025 – mar 2026
--      - CONFIRMED + fechas actuales: incluyen 2026-06-15 (hoy)
--      - PENDING: fechas futuras (jul 2026, dic 2026)
--      - CANCELED: varios
--    Walk-in: id_client=1, walk_in_name y walk_in_dni seteados
-- =============================================================================
INSERT INTO booking (id, start_date, end_date, total_price, status, created_at, walk_in_name, walk_in_dni, id_client, id_rental_unit) VALUES

-- ========== Resort 1: Zolea Club de Playa (MdP) ==========
-- Temporada verano 2025/2026 (CONFIRMED - pasadas)
(1,  '2025-12-20', '2025-12-25',  42500.0, 'CONFIRMED', '2025-11-10 09:00:00', NULL, NULL, 7,  1),
(2,  '2025-12-22', '2025-12-27',  42500.0, 'CONFIRMED', '2025-11-12 10:15:00', NULL, NULL, 8,  2),
(3,  '2025-12-28', '2026-01-03',  51000.0, 'CONFIRMED', '2025-11-15 14:30:00', NULL, NULL, 9,  3),
(4,  '2026-01-05', '2026-01-10',  72500.0, 'CONFIRMED', '2025-11-20 11:00:00', NULL, NULL, 10, 17),
(5,  '2026-01-10', '2026-01-15',  72500.0, 'CONFIRMED', '2025-11-22 16:45:00', NULL, NULL, 11, 18),
(6,  '2026-01-20', '2026-01-25',  42500.0, 'CONFIRMED', '2025-12-01 08:30:00', NULL, NULL, 12, 1),
(7,  '2026-02-01', '2026-02-05',  58000.0, 'CONFIRMED', '2025-12-10 13:00:00', NULL, NULL, 13, 19),
(8,  '2026-02-10', '2026-02-14',  34000.0, 'CANCELED',  '2025-12-15 09:20:00', NULL, NULL, 14, 4),
(9,  '2026-02-15', '2026-02-20',  72500.0, 'CONFIRMED', '2025-12-18 17:00:00', NULL, NULL, 20, 22),
(10, '2026-03-10', '2026-03-14',  48000.0, 'CONFIRMED', '2026-01-05 10:00:00', NULL, NULL, 7,  24),
(11, '2026-03-01', '2026-03-05',  34000.0, 'CANCELED',  '2026-01-10 12:00:00', NULL, NULL, 19, 5),
-- Reservas actuales (incluyen hoy 2026-06-15)
(12, '2026-06-10', '2026-06-17',  49000.0, 'CONFIRMED', '2026-05-20 09:00:00', NULL, NULL, 15, 9),
-- Walk-in (presencial, mostrador)
(13, '2026-06-14', '2026-06-16',  24000.0, 'CONFIRMED', '2026-06-14 11:30:00', 'Santiago Mora', '38421567', 1, 23),
-- Reservas futuras
(14, '2026-07-01', '2026-07-05',  28000.0, 'PENDING',   '2026-06-01 15:00:00', NULL, NULL, 16, 10),
(15, '2026-07-15', '2026-07-20',  72500.0, 'PENDING',   '2026-06-05 10:30:00', NULL, NULL, 17, 20),
(16, '2026-12-20', '2026-12-26',  87000.0, 'PENDING',   '2026-06-10 08:00:00', NULL, NULL, 18, 21),

-- ========== Resort 2: Ocean View Resort (Pinamar) ==========
-- Temporada verano 2025/2026 (CONFIRMED - pasadas)
(17, '2025-12-20', '2025-12-25', 110000.0, 'CONFIRMED', '2025-11-08 09:00:00', NULL, NULL, 21, 37),
(18, '2025-12-27', '2026-01-02', 132000.0, 'CONFIRMED', '2025-11-10 11:00:00', NULL, NULL, 22, 38),
(19, '2026-01-05', '2026-01-09',  52000.0, 'CONFIRMED', '2025-11-14 14:00:00', NULL, NULL, 7,  25),
(20, '2026-01-15', '2026-01-20', 110000.0, 'CONFIRMED', '2025-11-25 09:30:00', NULL, NULL, 8,  39),
(21, '2026-02-05', '2026-02-10',  65000.0, 'CANCELED',  '2025-12-05 10:00:00', NULL, NULL, 9,  26),
(22, '2026-02-20', '2026-02-24',  72000.0, 'CONFIRMED', '2026-01-02 16:00:00', NULL, NULL, 24, 43),
(23, '2026-03-05', '2026-03-08',  39000.0, 'CONFIRMED', '2026-01-15 09:00:00', NULL, NULL, 25, 29),
-- Reserva actual
(24, '2026-06-13', '2026-06-18', 110000.0, 'CONFIRMED', '2026-05-25 10:00:00', NULL, NULL, 10, 40),
-- Walk-in actual
(25, '2026-06-14', '2026-06-15',  13000.0, 'CONFIRMED', '2026-06-14 10:00:00', 'María González', '42156789', 1, 28),
-- Reservas futuras
(26, '2026-07-10', '2026-07-14',  52000.0, 'PENDING',   '2026-06-02 11:00:00', NULL, NULL, 11, 27),
(27, '2026-12-26', '2026-12-31', 110000.0, 'PENDING',   '2026-06-08 09:30:00', NULL, NULL, 23, 41),

-- ========== Resort 3: Arena Dorada (Villa Gesell) ==========
-- Temporada verano 2025/2026 (CONFIRMED - pasadas)
(28, '2025-12-23', '2025-12-28',  80000.0, 'CONFIRMED', '2025-11-12 10:00:00', NULL, NULL, 12, 55),
(29, '2026-01-02', '2026-01-07',  80000.0, 'CONFIRMED', '2025-11-20 14:00:00', NULL, NULL, 13, 56),
(30, '2026-01-15', '2026-01-20',  45000.0, 'CANCELED',  '2025-11-28 09:00:00', NULL, NULL, 14, 45),
(31, '2026-02-05', '2026-02-09',  64000.0, 'CONFIRMED', '2026-01-05 11:00:00', NULL, NULL, 15, 57),
-- Reserva actual
(32, '2026-06-12', '2026-06-16',  36000.0, 'CONFIRMED', '2026-05-28 09:00:00', NULL, NULL, 16, 46),
-- Reservas futuras
(33, '2026-07-05', '2026-07-10',  80000.0, 'PENDING',   '2026-06-03 10:00:00', NULL, NULL, 17, 58),
(34, '2026-12-22', '2026-12-27',  45000.0, 'PENDING',   '2026-06-11 08:30:00', NULL, NULL, 18, 47),

-- ========== Resort 4: Costa Sur (Miramar) ==========
-- Temporada verano 2025/2026 (CONFIRMED - pasadas)
(35, '2025-12-21', '2025-12-26',  67500.0, 'CONFIRMED', '2025-11-09 09:00:00', NULL, NULL, 19, 75),
(36, '2026-01-03', '2026-01-08',  67500.0, 'CONFIRMED', '2025-11-18 13:00:00', NULL, NULL, 20, 76),
(37, '2026-01-20', '2026-01-25',  37500.0, 'CONFIRMED', '2025-12-02 10:30:00', NULL, NULL, 21, 65),
(38, '2026-02-12', '2026-02-16',  54000.0, 'CANCELED',  '2025-12-20 09:00:00', NULL, NULL, 22, 77),
-- Reserva actual
(39, '2026-06-14', '2026-06-19',  37500.0, 'CONFIRMED', '2026-05-30 11:00:00', NULL, NULL, 23, 66),
-- Reservas futuras
(40, '2026-07-12', '2026-07-17',  67500.0, 'PENDING',   '2026-06-04 09:00:00', NULL, NULL, 24, 78),
(41, '2026-12-23', '2026-12-28',  37500.0, 'PENDING',   '2026-06-09 10:00:00', NULL, NULL, 25, 67),

-- ========== Resort 5: Mar del Sur (Necochea) ==========
-- Temporada verano 2025/2026 (CONFIRMED - pasadas)
(42, '2025-12-22', '2025-12-27',  70000.0, 'CONFIRMED', '2025-11-11 10:00:00', NULL, NULL, 24, 93),
(43, '2026-01-04', '2026-01-09',  70000.0, 'CONFIRMED', '2025-11-22 15:00:00', NULL, NULL, 25, 94),
(44, '2026-02-01', '2026-02-05',  32000.0, 'CONFIRMED', '2025-12-08 09:30:00', NULL, NULL, 7,  85),
-- Reserva actual (empieza hoy)
(45, '2026-06-15', '2026-06-20',  70000.0, 'CONFIRMED', '2026-06-01 08:00:00', NULL, NULL, 8,  95),
-- Reservas futuras
(46, '2026-07-08', '2026-07-13',  70000.0, 'PENDING',   '2026-06-05 11:00:00', NULL, NULL, 9,  96),
(47, '2026-12-23', '2026-12-28',  40000.0, 'PENDING',   '2026-06-12 09:00:00', NULL, NULL, 10, 86);

-- =============================================================================
-- 7. HUÉSPEDES
--    Solo para reservas CONFIRMED. last_entry_at (cuándo entró por última vez,
--    en hora de Buenos Aires) arranca en NULL: se completa más abajo, cuando las
--    fechas de las reservas ya quedaron corridas a hoy.
--    Tokens: formato tok-{bookingId:05d}-{seq}-{chars}
-- =============================================================================
INSERT INTO guest (id_guest, full_name, qr_token, last_entry_at, id_booking) VALUES

-- Booking 1 (Santiago Rodríguez, A-01, dic 2025, pasada)
(1,  'Santiago Rodríguez',   'tok-00001-A1-SAN9',  NULL ,  1),
(2,  'Clara Rodríguez',      'tok-00001-A2-CLA8',  NULL ,  1),

-- Booking 2 (Valentina García, A-02, dic 2025, pasada)
(3,  'Valentina García',     'tok-00002-A1-VAL7',  NULL ,  2),
(4,  'Tomás García',         'tok-00002-A2-TOM6',  NULL ,  2),
(5,  'Lucía García',         'tok-00002-A3-LUC5',  NULL ,  2),

-- Booking 3 (Matías Fernández, A-03, dic 2025 – ene 2026, pasada)
(6,  'Matías Fernández',     'tok-00003-A1-MAT4',  NULL ,  3),
(7,  'Renata Fernández',     'tok-00003-A2-REN3',  NULL ,  3),

-- Booking 4 (Camila Martínez, C-01, ene 2026, pasada)
(8,  'Camila Martínez',      'tok-00004-A1-CAM2',  NULL ,  4),
(9,  'Julián Martínez',      'tok-00004-A2-JUL1',  NULL ,  4),
(10, 'Felipe Martínez',      'tok-00004-A3-FEL0',  NULL ,  4),

-- Booking 5 (Luciano Torres, C-02, ene 2026, pasada)
(11, 'Luciano Torres',       'tok-00005-A1-LUC9',  NULL ,  5),
(12, 'Maite Torres',         'tok-00005-A2-MAI8',  NULL ,  5),

-- Booking 6 (Agustina López, A-01, ene 2026, pasada)
(13, 'Agustina López',       'tok-00006-A1-AGU7',  NULL ,  6),
(14, 'Bruno López',          'tok-00006-A2-BRU6',  NULL ,  6),

-- Booking 7 (Ramiro Gómez, C-03, feb 2026, pasada)
(15, 'Ramiro Gómez',         'tok-00007-A1-RAM5',  NULL ,  7),
(16, 'Paz Gómez',            'tok-00007-A2-PAZ4',  NULL ,  7),
(17, 'Marcos Gómez',         'tok-00007-A3-MAR3',  NULL ,  7),

-- Booking 9 (Micaela Flores, C-06, feb 2026, pasada)
(18, 'Micaela Flores',       'tok-00009-A1-MIC2',  NULL ,  9),
(19, 'Ignacio Flores',       'tok-00009-A2-IGN1',  NULL ,  9),

-- Booking 10 (Santiago Rodríguez, D-02, mar 2026, pasada)
(20, 'Santiago Rodríguez',   'tok-00010-A1-SAN0',  NULL ,  10),
(21, 'Clara Rodríguez',      'tok-00010-A2-CLA9',  NULL ,  10),

-- Booking 12 (Ezequiel Sánchez, B-01, ACTUAL 10-17 jun 2026)
(22, 'Ezequiel Sánchez',     'tok-00012-A1-EZE8',  NULL , 12),
(23, 'Daniela Sánchez',      'tok-00012-A2-DAN7',  NULL , 12),

-- Booking 13 (Walk-in Santiago Mora, D-01, ACTUAL 14-16 jun)
(24, 'Santiago Mora',        'tok-00013-A1-SAN6',  NULL ,  13),

-- Booking 17 (Facundo Ruiz, T-01 Pinamar, dic 2025, pasada)
(25, 'Facundo Ruiz',         'tok-00017-A1-FAC5',  NULL ,  17),
(26, 'Sofía Ruiz',           'tok-00017-A2-SOF4',  NULL ,  17),
(27, 'Martín Ruiz',          'tok-00017-A3-MAR3',  NULL ,  17),

-- Booking 18 (Milagros Jiménez, T-02 Pinamar, dic 2025 – ene 2026, pasada)
(28, 'Milagros Jiménez',     'tok-00018-A1-MIL2',  NULL ,  18),
(29, 'Federico Jiménez',     'tok-00018-A2-FED1',  NULL ,  18),

-- Booking 19 (Santiago Rodríguez, U-01 Pinamar, ene 2026, pasada)
(30, 'Santiago Rodríguez',   'tok-00019-A1-SAN0',  NULL ,  19),
(31, 'Clara Rodríguez',      'tok-00019-A2-CLA9',  NULL ,  19),

-- Booking 20 (Valentina García, T-03 Pinamar, ene 2026, pasada)
(32, 'Valentina García',     'tok-00020-A1-VAL8',  NULL ,  20),
(33, 'Tomás García',         'tok-00020-A2-TOM7',  NULL ,  20),
(34, 'Lucía García',         'tok-00020-A3-LUC6',  NULL ,  20),

-- Booking 22 (Rocío Villalba, T-07 Pinamar, feb 2026, pasada)
(35, 'Rocío Villalba',       'tok-00022-A1-ROC5',  NULL ,  22),
(36, 'Diego Villalba',       'tok-00022-A2-DIE4',  NULL ,  22),

-- Booking 23 (Sebastián Medina, U-05 Pinamar, mar 2026, pasada)
(37, 'Sebastián Medina',     'tok-00023-A1-SEB3',  NULL ,  23),
(38, 'Laura Medina',         'tok-00023-A2-LAU2',  NULL ,  23),

-- Booking 24 (Camila Martínez, T-04 Pinamar, ACTUAL 13-18 jun)
(39, 'Camila Martínez',      'tok-00024-A1-CAM1',  NULL , 24),
(40, 'Julián Martínez',      'tok-00024-A2-JUL0',  NULL , 24),

-- Booking 25 (Walk-in María González, U-04 Pinamar, ACTUAL 14-15 jun)
(41, 'María González',       'tok-00025-A1-MAR9',  NULL ,  25),

-- Booking 28 (Agustina López, GC-01 Gesell, dic 2025, pasada)
(42, 'Agustina López',       'tok-00028-A1-AGU8',  NULL ,  28),
(43, 'Bruno López',          'tok-00028-A2-BRU7',  NULL ,  28),
(44, 'Valentina López',      'tok-00028-A3-VAL6',  NULL ,  28),

-- Booking 29 (Ramiro Gómez, GC-02 Gesell, ene 2026, pasada)
(45, 'Ramiro Gómez',         'tok-00029-A1-RAM5',  NULL ,  29),
(46, 'Paz Gómez',            'tok-00029-A2-PAZ4',  NULL ,  29),

-- Booking 31 (Ezequiel Sánchez, GC-03 Gesell, feb 2026, pasada)
(47, 'Ezequiel Sánchez',     'tok-00031-A1-EZE3',  NULL ,  31),
(48, 'Daniela Sánchez',      'tok-00031-A2-DAN2',  NULL ,  31),

-- Booking 32 (Natalia Romero, AG-02 Gesell, ACTUAL 12-16 jun)
(49, 'Natalia Romero',       'tok-00032-A1-NAT1',  NULL , 32),
(50, 'Carlos Romero',        'tok-00032-A2-CAR0',  NULL , 32),

-- Booking 35 (Tomás Gutiérrez, KA-01 Miramar, dic 2025, pasada)
(51, 'Tomás Gutiérrez',      'tok-00035-A1-TOM9',  NULL ,  35),
(52, 'Florencia Gutiérrez',  'tok-00035-A2-FLO8',  NULL ,  35),

-- Booking 36 (Micaela Flores, KA-02 Miramar, ene 2026, pasada)
(53, 'Micaela Flores',       'tok-00036-A1-MIC7',  NULL ,  36),
(54, 'Ignacio Flores',       'tok-00036-A2-IGN6',  NULL ,  36),

-- Booking 37 (Facundo Ruiz, PM-01 Miramar, ene 2026, pasada)
(55, 'Facundo Ruiz',         'tok-00037-A1-FAC5',  NULL ,  37),
(56, 'Sofía Ruiz',           'tok-00037-A2-SOF4',  NULL ,  37),
(57, 'Martín Ruiz',          'tok-00037-A3-MAR3',  NULL ,  37),

-- Booking 39 (Nicolás Acosta, PM-02 Miramar, ACTUAL 14-19 jun)
(58, 'Nicolás Acosta',       'tok-00039-A1-NIC2',  NULL , 39),
(59, 'Camila Acosta',        'tok-00039-A2-CAA1',  NULL , 39),

-- Booking 42 (Rocío Villalba, MS-01 Necochea, dic 2025, pasada)
(60, 'Rocío Villalba',       'tok-00042-A1-ROC0',  NULL ,  42),
(61, 'Diego Villalba',       'tok-00042-A2-DIE9',  NULL ,  42),

-- Booking 43 (Sebastián Medina, MS-02 Necochea, ene 2026, pasada)
(62, 'Sebastián Medina',     'tok-00043-A1-SEB8',  NULL ,  43),
(63, 'Laura Medina',         'tok-00043-A2-LAU7',  NULL ,  43),

-- Booking 44 (Santiago Rodríguez, NC-01 Necochea, feb 2026, pasada)
(64, 'Santiago Rodríguez',   'tok-00044-A1-SAN6',  NULL ,  44),
(65, 'Clara Rodríguez',      'tok-00044-A2-CLA5',  NULL ,  44),

-- Booking 45 (Valentina García, MS-03 Necochea, ACTUAL empieza hoy)
(66, 'Valentina García',     'tok-00045-A1-VAL4',  NULL , 45),
(67, 'Tomás García',         'tok-00045-A2-TOM3',  NULL , 45),
(68, 'Lucía García',         'tok-00045-A3-LUC2',  NULL , 45);

-- =============================================================================
-- BACKFILL DNI — permite validar el ingreso por DNI (además del QR/token)
-- =============================================================================
-- Cada cliente regular recibe un DNI demo único (formato 40XXXXXX).
UPDATE client SET dni = CONCAT('40', LPAD(id_client, 6, '0'))
WHERE role = 'USER' AND id_client > 1;

-- El huésped titular hereda el DNI de su cliente (coincide el nombre completo).
UPDATE guest g
JOIN booking b ON g.id_booking = b.id
JOIN client c ON b.id_client = c.id_client
SET g.dni = c.dni
WHERE g.full_name = CONCAT(c.first_name, ' ', c.last_name) AND c.dni IS NOT NULL;

-- =============================================================================
-- FECHAS RELATIVAS — mantiene reservas "actuales" vigentes el día de la demo.
-- El gate de validación de ingreso exige inicio <= hoy <= fin (ver GuestService),
-- así que las reservas demo se anclan a @today para no vencerse con el tiempo.
-- =============================================================================
-- Reservas confirmadas vigentes hoy (una por balneario): permiten validar QR/DNI.
UPDATE booking SET start_date = @today - INTERVAL 1 DAY,
                   end_date   = @today + INTERVAL 4 DAY
WHERE id IN (12, 24, 32, 39, 45);

-- Walk-ins presenciales vigentes hoy.
UPDATE booking SET start_date = @today,
                   end_date   = @today + INTERVAL 1 DAY
WHERE id IN (13, 25);

-- Reservas PENDING: dos problemas, los dos por tener fechas absolutas.
--
-- 1) created_at fijo en 2025/2026. BookingService.cancelExpiredBookings corre
--    cada cinco minutos y cancela toda PENDING creada hace 75 minutos o más
--    (Booking.PAYMENT_WINDOW más Booking.CLEANUP_GRACE; hasta el 07/11 eran
--    24 h), así que a la primera ejecución del cron la demo se quedaba sin
--    ninguna PENDING: se caía el flujo de "reintentar pago" y la columna PENDING
--    del panel de admin.
-- 2) start_date en jul/dic 2026. Las de julio ya son pasado, así que dejaron de
--    ser "reservas futuras".
--
-- Se anclan las dos cosas al arranque. Las pendientes se crean hace diez
-- minutos: se ven pendientes al arrancar, su link vence a la hora de creadas y
-- la limpieza las cancela entre los 75 y los 80 minutos. La hora va en UTC, como
-- todas (ver FECHAS Y HORAS, al principio).
-- La duración original de cada reserva se preserva: end_date se calcula con el
-- DATEDIFF viejo ANTES de que start_date se pise (MySQL evalúa el SET de
-- izquierda a derecha).
UPDATE booking SET created_at = UTC_TIMESTAMP() - INTERVAL 10 MINUTE
WHERE status = 'PENDING';

UPDATE booking
SET end_date   = @today + INTERVAL (30 + (id MOD 20)) DAY
                           + INTERVAL DATEDIFF(end_date, start_date) DAY,
    start_date = @today + INTERVAL (30 + (id MOD 20)) DAY
WHERE status = 'PENDING';

-- Las personas de las reservas confirmadas que ya terminaron entraron por última
-- vez el último día, a las 11. Las de las vigentes y las que vienen, todavía no:
-- desde la 15.6 el QR sirve toda la estadía, así que escanearlas pasa en verde.
UPDATE guest g JOIN booking b ON b.id = g.id_booking
SET g.last_entry_at = TIMESTAMP(b.end_date) + INTERVAL 11 HOUR
WHERE b.status = 'CONFIRMED' AND b.end_date < @today;

-- Recalcular total_price de TODAS las reservas contra el precio de su unidad.
-- Los UPDATE de fechas de arriba cambian la duración pero no tocaban el importe,
-- así que las reservas vigentes —justo las que se abren en pantalla para mostrar
-- el QR— quedaban con un total que no se corresponde con sus fechas.
--
-- CONVENCIÓN DE FECHAS: fin INCLUSIVO, que es lo que calcula Booking.diasOcupados()
-- con ChronoUnit.DAYS.between(start, end) + 1. Del día 10 al 12 son tres días,
-- que son los mismos tres que bloquea la consulta de disponibilidad.
--
-- El + 1 de acá y el + 1 de la entidad tienen que moverse juntos: si el seed
-- calculara distinto que la aplicación, los precios de la demo dirían una cosa
-- y una reserva nueva sobre la misma unidad diría otra.
UPDATE booking b
JOIN rental_unit u ON b.id_rental_unit = u.id_rental_unit
SET b.total_price = (DATEDIFF(b.end_date, b.start_date) + 1) * u.daily_price;

-- =============================================================================
-- 8. PERTENENCIA ADMINISTRADOR → BALNEARIO
--
-- La relación real es Client.managed_resort. Este UPDATE la deriva del
-- admin_email, que es como estaba expresada antes: los cinco clientes con rol
-- ADMIN quedan atados al balneario cuyo admin_email coincide con su email.
--
-- Sin esto, un administrador de la demo no ve NINGUNA unidad ni reserva: las
-- consultas del panel filtran por balneario, y sin balneario asignado el
-- listado de unidades vuelve vacío.
-- =============================================================================
UPDATE client c
JOIN resort r ON c.email = r.admin_email
SET c.id_managed_resort = r.id_resort;

-- =============================================================================
-- 9. CANCELACIONES CON REINTEGRO (TFI, 14.3)
--
-- Tres reservas del balneario 1 canceladas por el cliente en los últimos días,
-- para que el panel tenga avisos de cancelación y Mis reservas muestre un
-- reintegro. Van al final, con el total ya calculado contra el precio de la
-- unidad, y con el reintegro de la política (Booking.refundFor):
--   - 48: canceló con más de dos días de anticipación → 100 %.
--   - 49: canceló el día anterior al inicio → 50 %.
--   - 50: canceló con más de dos días de anticipación → 100 %.
-- Las fechas son relativas al arranque, como el resto de la demo. La 49 empieza
-- hoy y se canceló hace un día: es el día anterior a cualquier hora.
-- =============================================================================
INSERT INTO booking (id, start_date, end_date, total_price, status, created_at,
                     canceled_at, canceled_by, refund_amount, id_client, id_rental_unit)
SELECT 48, @today + INTERVAL 12 DAY, @today + INTERVAL 15 DAY, 4 * u.daily_price, 'CANCELED',
       UTC_TIMESTAMP() - INTERVAL 8 DAY, UTC_TIMESTAMP() - INTERVAL 2 DAY, 'CLIENT', 4 * u.daily_price, 7, u.id_rental_unit
FROM rental_unit u WHERE u.id_rental_unit = 5;

INSERT INTO booking (id, start_date, end_date, total_price, status, created_at,
                     canceled_at, canceled_by, refund_amount, id_client, id_rental_unit)
SELECT 49, @today, @today + INTERVAL 2 DAY, 3 * u.daily_price, 'CANCELED',
       UTC_TIMESTAMP() - INTERVAL 5 DAY, UTC_TIMESTAMP() - INTERVAL 1 DAY, 'CLIENT', ROUND(3 * u.daily_price * 0.5, 2), 8,
       u.id_rental_unit
FROM rental_unit u WHERE u.id_rental_unit = 6;

INSERT INTO booking (id, start_date, end_date, total_price, status, created_at,
                     canceled_at, canceled_by, refund_amount, id_client, id_rental_unit)
SELECT 50, @today + INTERVAL 20 DAY, @today + INTERVAL 24 DAY, 5 * u.daily_price, 'CANCELED',
       UTC_TIMESTAMP() - INTERVAL 10 DAY, UTC_TIMESTAMP() - INTERVAL 4 DAY, 'CLIENT', 5 * u.daily_price, 9, u.id_rental_unit
FROM rental_unit u WHERE u.id_rental_unit = 7;

-- =============================================================================
-- 10. RESEÑAS (TFI, 14.1)
--
-- Una por reserva, solo en reservas confirmadas cuya estadía ya terminó (las de
-- la temporada 2025/2026). Las 48 a 50 son las cancelaciones de la 14.3 y no
-- llevan reseña. Promedios: Mar del Plata 4,2; Pinamar 4,7; Villa Gesell 3,5;
-- Miramar 4,5; Necochea 5,0.
--
-- santi.rodriguez@gmail.com (cliente 7) calificó la 1 y la 19, y le quedan la
-- 10 y la 44 sin calificar: con su cuenta se puede mostrar «Calificar».
-- La fecha de cada reseña es relativa al arranque, como el resto de la demo. Las
-- horas están escritas en hora de Buenos Aires, que es como se van a ver, y el
-- UPDATE de abajo las pasa a UTC, que es como las guarda la base.
-- =============================================================================
INSERT INTO review (id_review, id_booking, rating, comment, created_at) VALUES
-- Resort 1: Zolea Club de Playa (MdP)
(1,  1,  5, 'Primera fila de verdad: el mar a diez metros y la sombrilla lista al llegar.', @today - INTERVAL 70 DAY + INTERVAL 19 HOUR),
(2,  2,  4, 'Muy lindo el lugar. El estacionamiento se llena temprano.',                  @today - INTERVAL 64 DAY + INTERVAL 11 HOUR),
(3,  4,  5, 'La carpa premium vale cada peso. Atención impecable.',                       @today - INTERVAL 45 DAY + INTERVAL 20 HOUR),
(4,  6,  3, NULL,                                                                          @today - INTERVAL 30 DAY + INTERVAL 18 HOUR),
(5,  9,  4, 'Buena carpa y buen bar. Los baños podrían estar más limpios a la tarde.',    @today - INTERVAL 12 DAY + INTERVAL 21 HOUR),
-- Resort 2: Ocean View Resort (Pinamar)
(6,  17, 5, 'Tranquilo, sin ruido y con un servicio de playa excelente.',                 @today - INTERVAL 75 DAY + INTERVAL 17 HOUR),
(7,  19, 4, 'La sombrilla está bien ubicada y el personal es muy amable. Volvería.',      @today - INTERVAL 50 DAY + INTERVAL 19 HOUR),
(8,  22, 5, 'Lo mejor de Pinamar. Te resuelven todo.',                                    @today - INTERVAL 20 DAY + INTERVAL 16 HOUR),
-- Resort 3: Arena Dorada (Villa Gesell)
(9,  28, 4, 'Mucha onda y buena música. Ideal para ir con amigos.',                       @today - INTERVAL 72 DAY + INTERVAL 22 HOUR),
(10, 31, 3, 'Lindo lugar, pero la carpa tenía la lona rota.',                             @today - INTERVAL 35 DAY + INTERVAL 13 HOUR),
-- Resort 4: Costa Sur (Miramar)
(11, 35, 5, 'Perfecto para ir con chicos: tranquilo y con guardavidas atentos.',          @today - INTERVAL 68 DAY + INTERVAL 18 HOUR),
(12, 37, 4, NULL,                                                                          @today - INTERVAL 40 DAY + INTERVAL 10 HOUR),
-- Resort 5: Mar del Sur (Necochea)
(13, 42, 5, 'Playa ancha y casi vacía. Ideal para desconectar.',                          @today - INTERVAL 66 DAY + INTERVAL 20 HOUR);

-- De hora de Buenos Aires a UTC (ver FECHAS Y HORAS, al principio).
UPDATE review SET created_at = created_at + INTERVAL 3 HOUR;

-- =============================================================================
-- 11. ESTADÍSTICAS DEL PANEL (TFI, 14.7)
--
-- Veinte reservas confirmadas más de Zolea Club de Playa (balneario 1), así los
-- gráficos del panel de admin.mdp@zolea.com no salen vacíos: once del último
-- mes y medio, cuatro que incluyen hoy (62 a 65) y cinco de las próximas
-- semanas. Las fechas son relativas a @today y no pisan otra reserva de la misma
-- unidad; ninguna usa la A-08, que está bloqueada. El total es el de siempre:
-- los días con los dos extremos por el precio diario de la unidad.
-- =============================================================================
INSERT INTO booking (id, start_date, end_date, total_price, status, created_at, id_client, id_rental_unit)
SELECT d.id, @today + INTERVAL d.desde DAY, @today + INTERVAL (d.desde + d.dias - 1) DAY,
       d.dias * u.daily_price, 'CONFIRMED',
       @today + INTERVAL (d.desde - 12) DAY + INTERVAL 14 HOUR, d.cliente, u.id_rental_unit
FROM (
              SELECT 51 AS id, 1 AS unidad, -38 AS desde, 4 AS dias, 8 AS cliente
    UNION ALL SELECT 52,  2, -36, 3,  9
    UNION ALL SELECT 53,  3, -33, 5, 10
    UNION ALL SELECT 54, 17, -30, 4, 11
    UNION ALL SELECT 55, 18, -28, 3, 12
    UNION ALL SELECT 56,  1, -25, 2, 13
    UNION ALL SELECT 57, 11, -22, 4, 14
    UNION ALL SELECT 58, 19, -18, 5, 15
    UNION ALL SELECT 59,  2, -15, 3, 16
    UNION ALL SELECT 60, 12, -12, 4, 17
    UNION ALL SELECT 61,  4,  -8, 3, 18
    -- Las cuatro que incluyen hoy.
    UNION ALL SELECT 62,  1,  -2, 5, 19
    UNION ALL SELECT 63,  3,  -1, 3, 20
    UNION ALL SELECT 64, 17,   0, 4, 21
    UNION ALL SELECT 65, 22,  -3, 6, 22
    -- Las que vienen.
    UNION ALL SELECT 66,  2,   4, 3, 24
    UNION ALL SELECT 67, 18,   8, 5, 25
    UNION ALL SELECT 68, 11,  15, 4,  8
    UNION ALL SELECT 69, 19,  22, 3,  9
    UNION ALL SELECT 70, 24,  30, 5, 10
) d
JOIN rental_unit u ON u.id_rental_unit = d.unidad;

-- El titular de cada una, con su DNI. Las que ya terminaron entraron; las que
-- vienen, todavía no.
INSERT INTO guest (full_name, dni, qr_token, last_entry_at, id_booking)
SELECT CONCAT(c.first_name, ' ', c.last_name), c.dni,
       CONCAT('tok-', LPAD(b.id, 5, '0'), '-A1-PNL'),
       IF(b.end_date < @today, TIMESTAMP(b.end_date) + INTERVAL 11 HOUR, NULL), b.id
FROM booking b JOIN client c ON c.id_client = b.id_client
WHERE b.id BETWEEN 51 AND 70;

-- Las que incluyen hoy: en la 62, la 63 y la 65 el titular ya entró hoy, hace
-- una hora (o a la medianoche, si la demostración arranca antes de la una); en
-- la 64, que empieza hoy, todavía no. Con los acompañantes, hoy hay gente
-- adentro y gente por llegar. La hora es la de Buenos Aires, como @today.
SET @entered_today = GREATEST(TIMESTAMP(@today), UTC_TIMESTAMP() - INTERVAL 4 HOUR);
UPDATE guest SET last_entry_at = @entered_today WHERE id_booking IN (62, 63, 65);

-- Del titular de la 63 (que empezó antes de hoy) también se ve que ya había
-- entrado ayer: el QR sirve toda la estadía.
INSERT INTO guest (full_name, qr_token, last_entry_at, id_booking) VALUES
('Lucía Gutiérrez', 'tok-00062-A2-PNL', @entered_today,                   62),
('Joaquín Flores',  'tok-00063-A2-PNL', @entered_today - INTERVAL 1 DAY,  63),
('Ana Flores',      'tok-00063-A3-PNL', NULL,                             63),
('Paula Ruiz',      'tok-00064-A2-PNL', NULL,                             64);

-- =============================================================================
-- 12. UNIDAD DADA DE BAJA Y PAGOS REGISTRADOS (TFI, 15.4)
--
-- En Zolea Club de Playa (balneario 1), la D-01 (unidad 23) está dada de baja:
-- tiene dos reservas pasadas —la 13, de mostrador, y la 71— y ninguna por
-- delante, que es lo único que permite la baja. No aparece en la ficha ni en el
-- plano, y admin.mdp@zolea.com la sigue viendo en Unidades, con retired en true.
-- =============================================================================
INSERT INTO booking (id, start_date, end_date, total_price, status, created_at, id_client, id_rental_unit)
SELECT 71, @today - INTERVAL 20 DAY, @today - INTERVAL 18 DAY, 3 * u.daily_price, 'CONFIRMED',
       UTC_TIMESTAMP() - INTERVAL 30 DAY, 11, u.id_rental_unit
FROM rental_unit u WHERE u.id_rental_unit = 23;

INSERT INTO guest (full_name, dni, qr_token, last_entry_at, id_booking)
SELECT CONCAT(c.first_name, ' ', c.last_name), c.dni, 'tok-00071-A1-BAJ',
       TIMESTAMP(@today - INTERVAL 18 DAY) + INTERVAL 11 HOUR, 71
FROM client c WHERE c.id_client = 11;

UPDATE rental_unit SET retired = true WHERE id_rental_unit = 23;

-- Pagos aprobados de algunas reservas confirmadas del balneario 1, así el
-- detalle de la reserva los muestra: las cuatro que incluyen hoy (62 a 65), dos
-- de las que vienen (66 y 67) y la 71. Cada uno por el total de su reserva, diez
-- minutos después de crearla. Las horas van en UTC, como created_at.
INSERT INTO payment (gateway_payment_id, status, amount, paid_at, recorded_at, id_booking)
SELECT CONCAT('demo-mp-', LPAD(b.id, 5, '0')), 'approved', b.total_price,
       b.created_at + INTERVAL 10 MINUTE, b.created_at + INTERVAL 11 MINUTE, b.id
FROM booking b
WHERE b.id IN (62, 63, 64, 65, 66, 67, 71);

-- =============================================================================
-- 13. MIS RESERVAS DE SANTI (11.4)
--
-- santi.rodriguez@gmail.com (cliente 7) tenía solo reservas pasadas y una
-- cancelada, así que la pestaña de próximas de Mis reservas salía vacía. Se le
-- suman tres próximas en otros balnearios: una confirmada que incluye hoy (la
-- tarjeta destacada), otra confirmada más adelante y una pendiente de pago,
-- creada hace diez minutos como las demás pendientes. Ninguna toca Mar del Plata,
-- así los números del panel de admin.mdp@zolea.com no cambian.
-- =============================================================================
INSERT INTO booking (id, start_date, end_date, total_price, status, created_at, id_client, id_rental_unit)
SELECT d.id, @today + INTERVAL d.desde DAY, @today + INTERVAL (d.desde + d.dias - 1) DAY,
       d.dias * u.daily_price, d.estado, d.creada, 7, u.id_rental_unit
FROM (
              SELECT 72 AS id, 30 AS unidad, -1 AS desde, 4 AS dias, 'CONFIRMED' AS estado,
                     @today - INTERVAL 15 DAY + INTERVAL 14 HOUR AS creada
    UNION ALL SELECT 73, 48, 20, 4, 'CONFIRMED', @today - INTERVAL 3 DAY + INTERVAL 22 HOUR
    UNION ALL SELECT 74, 88, 40, 2, 'PENDING',   UTC_TIMESTAMP() - INTERVAL 10 MINUTE
) d
JOIN rental_unit u ON u.id_rental_unit = d.unidad;

-- El titular de cada una, con su DNI y su QR sin usar.
INSERT INTO guest (full_name, dni, qr_token, is_entry_validated, id_booking)
SELECT CONCAT(c.first_name, ' ', c.last_name), c.dni,
       CONCAT('tok-', LPAD(b.id, 5, '0'), '-A1-SAN'), false, b.id
FROM booking b JOIN client c ON c.id_client = b.id_client
WHERE b.id BETWEEN 72 AND 74;
