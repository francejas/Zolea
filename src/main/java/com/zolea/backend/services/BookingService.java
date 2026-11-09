package com.zolea.backend.services;

// Import corregido a la carpeta correcta
import com.zolea.backend.dtos.booking.BookingRequest;
import com.zolea.backend.dtos.booking.BookingResponse;
import com.zolea.backend.dtos.booking.CancellationResponse;
import com.zolea.backend.dtos.guest.GuestSummaryResponse;
import com.zolea.backend.exceptions.booking.BookingForbiddenException;
import com.zolea.backend.exceptions.booking.BookingNotFoundException;
import com.zolea.backend.exceptions.booking.UnitNotAvailableException;
import com.zolea.backend.exceptions.client.ClientNotFoundException;
import com.zolea.backend.exceptions.rentalunit.RentalUnitNotFoundException;
import com.zolea.backend.models.*;
import com.zolea.backend.repositories.BookingRepository;
import com.zolea.backend.repositories.ClientRepository;
import com.zolea.backend.repositories.GuestRepository;
import com.zolea.backend.repositories.RentalUnitRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Slf4j
/**
 * <p><b>Transacciones:</b> la clase entera es de solo lectura y cada método que escribe lo declara.
 * Antes no había ninguna transacción declarada acá: el mapeo a DTO recorría colecciones LAZY fuera
 * de toda transacción y funcionaba únicamente porque {@code spring.jpa.open-in-view} dejaba la
 * sesión de base abierta durante toda la petición. Es decir, la transacción existía pero no la
 * había decidido nadie, y su límite lo ponía un filtro web.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class BookingService {

    private final BookingRepository bookingRepository;
    private final ClientRepository clientRepository;
    private final RentalUnitRepository rentalUnitRepository;
    private final GuestRepository guestRepository;
    private final Clock clock;

    /** Ahora en la zona del balneario. Ver {@link com.zolea.backend.config.TimeConfig}. */
    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    /** Hoy en la zona del balneario. */
    private LocalDate today() {
        return LocalDate.now(clock);
    }

    /**
     * Crea una reserva en estado {@link Status#PENDING}, con su huésped titular.
     *
     * <p>Es el caso de uso central del sistema, y el orden de sus pasos <b>no es intercambiable</b>:
     *
     * <ol>
     *   <li><b>Validar el rango.</b> Va primero porque con el fin anterior al inicio la consulta de
     *       disponibilidad no encuentra choques, así que la reserva pasaba y salía con precio
     *       negativo.</li>
     *   <li><b>Tomar el candado sobre la unidad.</b> Antes de consultar la disponibilidad, para que
     *       «consultar y después escribir» quede entero adentro del candado. Con el orden invertido,
     *       dos peticiones simultáneas leen «libre» las dos.</li>
     *   <li><b>Revalidar que la unidad no esté bloqueada.</b> El frontend la esconde, pero eso no es
     *       una regla: entrando por Swagger la unidad se reservaba igual.</li>
     *   <li><b>Consultar la disponibilidad y guardar</b>, ya con el candado puesto.</li>
     * </ol>
     *
     * <p>El titular puede venir de dos lados, y por eso {@code clientId} es opcional: una reserva
     * normal la hace un cliente con cuenta, y una de mostrador la carga un administrador para alguien
     * que no la tiene, con el nombre y el DNI en {@code walkInName} / {@code walkInDni}. Que haya uno
     * de los dos lo garantiza {@code @HolderRequired} sobre el pedido.
     *
     * <p>El precio lo calcula la entidad, con el mismo criterio de fechas —fin inclusivo— que usa la
     * consulta de disponibilidad. Si los dos dejaran de coincidir, una reserva cobraría una cantidad
     * de días y bloquearía otra.
     *
     * @param request datos de la reserva, ya validados en su forma por Bean Validation.
     * @return la reserva creada, con su identificador y su precio.
     * @throws com.zolea.backend.exceptions.booking.InvalidBookingRangeException si el fin es anterior al inicio.
     * @throws com.zolea.backend.exceptions.rentalunit.RentalUnitNotFoundException si la unidad no existe.
     * @throws com.zolea.backend.exceptions.booking.UnitNotAvailableException si la unidad está bloqueada u ocupada.
     * @throws com.zolea.backend.exceptions.client.ClientNotFoundException si se indicó un cliente que no existe.
     */
    @Transactional
    public BookingResponse createBooking(BookingRequest request) {

        // 1. El rango tiene que tener sentido antes que nada: con el fin anterior al inicio, la
        //    consulta de disponibilidad no encuentra choques y la reserva salía con precio negativo.
        Booking booking = new Booking();
        booking.setStartDate(request.startDate());
        booking.setEndDate(request.endDate());
        booking.validateDateRange();

        // 2. Tomar el candado sobre la unidad ANTES de mirar la disponibilidad. Las dos cosas
        //    —consultar si está libre y guardar la reserva— tienen que pasar con el candado puesto:
        //    si no, dos peticiones simultáneas leen "libre" las dos y la unidad queda reservada dos
        //    veces. Ver el Javadoc de findByIdForUpdate.
        RentalUnit rentalUnit = rentalUnitRepository.findByIdForUpdate(request.rentalUnitId())
                .orElseThrow(() -> new RentalUnitNotFoundException(
                        "Unidad no encontrada con el ID: " + request.rentalUnitId()));

        // Una unidad bloqueada no se reserva. El frontend ya la esconde, pero eso no es una regla:
        // entrando por Swagger, o desde cualquier otro cliente, la unidad se reservaba igual.
        if (Boolean.TRUE.equals(rentalUnit.getIsBlocked())) {
            throw new UnitNotAvailableException(
                    "La unidad " + rentalUnit.getIdentifier() + " está fuera de servicio.");
        }

        // 3. Validar disponibilidad en la BD (Consulta personalizada)
        if (!bookingRepository.isUnitAvailable(request.rentalUnitId(), request.startDate(), request.endDate())) {
            throw new UnitNotAvailableException("La unidad seleccionada ya está ocupada en ese rango de fechas.");
        }

        Client client = null;
        if (request.clientId() != null && request.clientId() > 0) {
            client = clientRepository.findById(request.clientId())
                    .orElseThrow(() -> new ClientNotFoundException(
                            "Cliente no encontrado con el ID: " + request.clientId()));
        }

        booking.setClient(client);
        booking.setRentalUnit(rentalUnit);

        booking.setStatus(Status.PENDING); // Siempre PENDING — el controller walk-in llama confirmBookingPayment

        booking.setCreatedAt(now());

        // --- ASIGNAR LOS DATOS DE MOSTRADOR ---
        booking.setWalkInName(request.walkInName());
        booking.setWalkInDni(request.walkInDni());
        // --------------------------------------

        booking.calculateTotalPrice(rentalUnit.getDailyPrice());

        Booking savedBooking = bookingRepository.save(booking);

        // CREACIÓN DE GUESTS — siempre por Booking.agregarHuesped, que es el punto único.
        //
        // El save explícito se mantiene aunque la relación tenga cascade: es lo que hace que el
        // huésped tenga su id asignado ya mismo, y el id viaja en la respuesta.
        //
        // El titular siempre obtiene su propio QR. En una reserva de mostrador el titular es la
        // persona que atendió el administrador, no el cliente semilla con el que entra la petición:
        // antes el QR salía impreso con el nombre del cliente de mostrador.
        String[] titular = savedBooking.holderDetails();
        if (titular != null) {
            guestRepository.save(savedBooking.addGuest(titular[0], titular[1]));
        }

        if (request.guests() != null && !request.guests().isEmpty()) {
            for (var guestReq : request.guests()) {
                if (guestReq.fullName() == null || guestReq.fullName().isBlank()) continue;
                guestRepository.save(savedBooking.addGuest(guestReq.fullName(), guestReq.dni()));
            }
        }

        // El mismo BookingResponse de 15 campos estaba armado a mano acá y en mapToBookingResponse.
        // Agregar un campo obligaba a tocar los dos, y olvidarse de uno compilaba igual. Ahora hay
        // un solo lugar: la reserva ya tiene sus huéspedes en memoria porque agregarHuesped mantiene
        // la colección.
        return mapToBookingResponse(savedBooking);
    }




    // 2. Obtener todas las reservas del sistema (Admin)
    /** Todas las reservas del sistema. Solo la usa un ADMIN sin balneario asignado. */
    public List<BookingResponse> getAllBookings() {
        return bookingRepository.findAll().stream()
                .map(this::mapToBookingResponse)
                .toList();
    }

    /** Las reservas del balneario que administra un ADMIN. */
    public List<BookingResponse> getBookingsByResortId(Long idResort) {
        return bookingRepository.findByResortId(idResort).stream()
                .map(this::mapToBookingResponse)
                .toList();
    }

    // 3. Obtener reservas por ID de Cliente (Cliente)
    public List<BookingResponse> getBookingsByClientId(Long clientId) {
        return bookingRepository.findByClientId(clientId).stream()
                .map(this::mapToBookingResponse)
                .toList();
    }

    // Obtener el detalle completo de una reserva específica por su ID
    @Transactional(readOnly = true)
    public BookingResponse getBookingById(Long id) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> new BookingNotFoundException("Reserva no encontrada con el ID: " + id));

        // Acá había un bloque que creaba un huésped si la reserva no tenía ninguno. Una consulta
        // que escribe en la base es una sorpresa para quien la lee y para quien la llama, y además
        // dependía de una colección que podía venir en null, así que devolvía HTTP 500. El huésped
        // del titular se crea al reservar y, si faltara, al confirmar el pago: los dos son los
        // momentos en los que la reserva efectivamente cambia.
        return mapToBookingResponse(booking);
    }

    private BookingResponse mapToBookingResponse(Booking booking) {
        List<GuestSummaryResponse> guestResponses = booking.getGuests() != null ?
                booking.getGuests().stream()
                .map(g -> new GuestSummaryResponse(g.getIdGuest(), g.getFullName(), g.getDni(), g.getIsEntryValidated(), g.getQrToken()))
                .toList() : new ArrayList<>();

        var unit = booking.getRentalUnit();
        var resort = unit.getResort();

        return new BookingResponse(
                booking.getId(),
                booking.getStartDate(),
                booking.getEndDate(),
                booking.getTotalPrice(),
                booking.getStatus(),
                booking.getCreatedAt(),
                booking.getClient() != null ? booking.getClient().getIdClient() : null,
                unit.getIdRentalUnit(),
                unit.getIdentifier(),
                unit.getType(),
                guestResponses,
                booking.getWalkInName(),
                booking.getWalkInDni(),
                resort != null ? resort.getIdResort() : null,
                resort != null ? resort.getName() : null,
                resort != null ? resort.getLocation() : null,
                resort != null ? resort.getCoverPhotoUrl() : null,
                booking.getCanceledAt(),
                booking.getCanceledBy(),
                booking.getRefundAmount()
        );
    }

    /**
     * Cancela una reserva del balneario del administrador: el balneario reintegra el 100 %. Hasta la
     * 14.3 un administrador cancelaba cualquier reserva del sistema (RNF03).
     */
    @Transactional
    public BookingResponse cancelBookingAsAdmin(Long bookingId, Long managedResortId) {
        Booking booking = findInResort(bookingId, managedResortId);
        booking.cancel(now(), CanceledBy.ADMIN);
        bookingRepository.save(booking);
        return mapToBookingResponse(booking);
    }

    /** Cancela una reserva del cliente, con la política de reintegro de {@link Booking#refundFor}. */
    @Transactional
    public BookingResponse cancelBookingAsClient(Long bookingId, String clientEmail) {
        Booking booking = findOfClient(bookingId, clientEmail);
        booking.cancel(now(), CanceledBy.CLIENT);
        bookingRepository.save(booking);
        return mapToBookingResponse(booking);
    }

    /** Lo que pasaría si el administrador cancela hoy, sin cancelar. */
    @Transactional(readOnly = true)
    public CancellationResponse getCancellationTermsAsAdmin(Long bookingId, Long managedResortId) {
        return CancellationResponse.of(findInResort(bookingId, managedResortId).refundFor(today(), true));
    }

    /** Lo que pasaría si el cliente cancela hoy, sin cancelar. */
    @Transactional(readOnly = true)
    public CancellationResponse getCancellationTermsAsClient(Long bookingId, String clientEmail) {
        return CancellationResponse.of(findOfClient(bookingId, clientEmail).refundFor(today(), false));
    }

    private Booking findInResort(Long bookingId, Long managedResortId) {
        Booking booking = findBooking(bookingId);
        if (!managedResortId.equals(booking.getRentalUnit().getResort().getIdResort())) {
            throw new BookingForbiddenException("Esa reserva es de otro balneario.");
        }
        return booking;
    }

    private Booking findOfClient(Long bookingId, String clientEmail) {
        Booking booking = findBooking(bookingId);
        if (booking.getClient() == null || !booking.getClient().getEmail().equals(clientEmail)) {
            throw new BookingForbiddenException("No tenés permiso para cancelar esta reserva");
        }
        return booking;
    }

    private Booking findBooking(Long bookingId) {
        return bookingRepository.findById(bookingId)
                .orElseThrow(() -> new BookingNotFoundException(
                        "Reserva no encontrada con el ID: " + bookingId));
    }

    /**
     * Confirma el pago de una reserva.
     *
     * <p>Es el único método al que llegan los dos caminos de cobro: la vuelta de MercadoPago y el
     * cobro en mostrador. La transacción es explícita porque cambia el estado de la reserva y puede
     * crear un huésped: antes eran dos unidades de trabajo distintas y una podía quedar a medias.
     */
    @Transactional
    public void confirmBookingPayment(Long bookingId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new BookingNotFoundException(
                        "Reserva no encontrada con el ID: " + bookingId));

        // Idempotente: la URL de retorno del pago la puede volver a abrir el navegador. Antes cada
        // visita creaba un huésped nuevo, con su propio QR.
        if (booking.getStatus() == Status.CONFIRMED) {
            return;
        }

        booking.confirm(); // rechaza revivir una reserva cancelada
        bookingRepository.save(booking);

        if (!booking.hasGuests()) {
            String[] titular = booking.holderDetails();
            if (titular != null) {
                guestRepository.save(booking.addGuest(titular[0], titular[1]));
            }
        }
    }


    // ==========================================
    // TAREA AUTOMÁTICA DE LIMPIEZA DE RESERVAS
    // ==========================================

    /**
     * Cancela, como del sistema, las reservas que siguen pendientes pasado el plazo de pago
     * ({@link Booking#PAYMENT_WINDOW}, una hora) más el margen ({@link Booking#CLEANUP_GRACE},
     * 15 minutos). Corre cada cinco minutos, así que una reserva sin pagar se cancela entre los 75 y
     * los 80 minutos de creada.
     */
    @Scheduled(cron = "0 */5 * * * *")
    @Transactional
    public void cancelExpiredBookings() {
        // 1. Las pendientes creadas antes de este momento ya pasaron el plazo de pago y el margen.
        LocalDateTime deadline = now().minus(Booking.PAYMENT_WINDOW).minus(Booking.CLEANUP_GRACE);

        // 2. Buscamos las reservas vencidas
        List<Booking> expiredBookings = bookingRepository.findExpiredPendingBookings(deadline);

        // 3. Si encontramos alguna, le cambiamos el estado a CANCELED y la guardamos
        if (!expiredBookings.isEmpty()) {
            for (Booking booking : expiredBookings) {
                // La misma transición que la cancelación manual; queda registrada como del sistema.
                booking.cancel(now(), CanceledBy.SYSTEM);
            }

            // saveAll es mucho más rápido que hacer un save() por cada reserva en un bucle
            bookingRepository.saveAll(expiredBookings);

            log.info("Limpieza automática: {} reservas canceladas por falta de pago.", expiredBookings.size());
        }
    }



}