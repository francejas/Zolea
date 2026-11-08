package com.zolea.backend.services;

import com.zolea.backend.dtos.booking.BookingRequest;
import com.zolea.backend.dtos.booking.BookingResponse;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Payment;
import com.zolea.backend.models.Status;
import com.zolea.backend.payments.CheckoutRequest;
import com.zolea.backend.payments.PaymentGateway;
import com.zolea.backend.payments.PaymentStatus;
import com.zolea.backend.repositories.BookingRepository;
import com.zolea.backend.repositories.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Reservar y cobrar, como un caso de uso.
 *
 * <p>Esta lógica vivía en {@code BookingController}: el endpoint armaba las tres URLs de retorno,
 * llamaba a la pasarela y decidía reglas de negocio leyendo el estado como texto. El problema no
 * era estético — <b>el caso de uso no existía fuera de HTTP</b>: no se lo podía invocar desde una
 * prueba, ni desde el trabajo automático, ni desde un aviso de la pasarela.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BookingCheckoutService {

    private final BookingService bookingService;
    private final PaymentGateway paymentGateway;
    private final PaymentRepository paymentRepository;
    private final Clock clock;
    private final BookingRepository bookingRepository;

    // PENDIENTE — las dos pasan a un @ConfigurationProperties validado, para que un despliegue mal
    // configurado falle al arrancar y no en el primer cobro.
    @Value("${NGROK_BASE_URL:http://localhost:8080}")
    private String baseUrl;

    // El valor por defecto es el puerto de Angular, que es donde corre el frontend de la v2. El
    // 3000 que había antes era el del frontend de la v1, que quedó congelado: con ese default, el
    // cliente terminaba el pago y lo mandábamos a un puerto donde no hay nada escuchando. En
    // cualquier caso lo pisa FRONTEND_URL del .env, que es lo que usa el despliegue.
    @Value("${FRONTEND_URL:http://localhost:4200}")
    private String frontendUrl;

    public String getFrontendUrl() {
        return frontendUrl;
    }

    /** Crea la reserva y devuelve adónde mandar al cliente a pagarla. */
    public Checkout start(BookingRequest request) {
        BookingResponse booking = bookingService.createBooking(request);
        return new Checkout(booking, paymentUrlFor(booking));
    }

    /** Genera un cobro nuevo para una reserva que quedó pendiente. */
    public String retry(Long bookingId) {
        BookingResponse booking = bookingService.getBookingById(bookingId);
        if (booking.status() != Status.PENDING) {
            throw new com.zolea.backend.exceptions.booking.BookingStateException(
                    "La reserva no está pendiente de pago.");
        }
        return paymentUrlFor(booking);
    }

    /**
     * Confirma la reserva <b>solo si la pasarela dice que el pago se hizo</b>.
     *
     * <p>Acá está el cambio importante. Antes, la dirección a la que la pasarela devuelve al
     * cliente confirmaba la reserva leyendo el número que venía en la URL, y descartaba el estado
     * que la propia pasarela informaba. Esa URL la escribe el navegador, así que cualquiera que
     * conociera el número de una reserva pendiente podía marcarla como pagada y quedarse con los
     * códigos QR. Los números son consecutivos.
     *
     * <p>Ahora se le pregunta a la pasarela, que es la única fuente confiable, y se comprueban dos
     * cosas: que el pago esté aprobado, y que <b>ese pago sea de esta reserva</b>. Sin la segunda,
     * alcanzaría con reutilizar el comprobante de cualquier pago aprobado —el propio, de una
     * reserva de $1— para confirmar otra.
     *
     * @return si la reserva quedó confirmada.
     */
    @Transactional
    public boolean confirmIfPaid(Long bookingId, String paymentId) {
        Optional<PaymentStatus> aprobado = approvedPayment(paymentId);
        if (aprobado.isEmpty()) {
            return false;
        }
        PaymentStatus status = aprobado.get();

        if (!bookingId.equals(status.bookingId())) {
            // Si esto aparece en el registro, alguien está probando comprobantes ajenos.
            log.warn("No se confirma la reserva {}: el pago {} corresponde a la reserva {}",
                    bookingId, status.paymentId(), status.bookingId());
            return false;
        }

        record(status, bookingId);
        bookingService.confirmBookingPayment(bookingId);
        return true;
    }

    /**
     * Confirma la reserva a partir de un aviso de la pasarela.
     *
     * <p>Se diferencia de {@link #confirmIfPaid} en de dónde sale la reserva. Allá el número viene
     * en la dirección que abre el navegador, así que hay que comprobar que ese pago sea realmente de
     * esa reserva. Acá <b>no llega ningún número de reserva</b>: se toma el del propio pago, que lo
     * informa la pasarela y es la fuente confiable. No hay nada que comparar porque no hay nada que
     * el que avisa haya podido elegir.
     *
     * <p><b>Es seguro procesarlo varias veces.</b> La pasarela reintenta el aviso si no recibe
     * respuesta a tiempo, así que el mismo pago puede llegar tres veces. No hace falta llevar un
     * registro de avisos ya vistos: confirmar una reserva ya confirmada no hace nada — la regla vive
     * en {@code Booking.confirm()} desde el bloque B.
     *
     * @return si la reserva quedó confirmada por este aviso.
     */
    @Transactional
    public boolean confirmFromNotification(String paymentId) {
        Optional<PaymentStatus> aprobado = approvedPayment(paymentId);
        if (aprobado.isEmpty()) {
            return false;
        }
        PaymentStatus status = aprobado.get();

        if (status.bookingId() == null) {
            log.warn("El pago {} no dice a qué reserva corresponde: no se confirma nada",
                    status.paymentId());
            return false;
        }

        if (!record(status, status.bookingId())) {
            // Otro aviso del mismo pago ya hizo el trabajo. Nada que hacer, y nada que reportar
            // como error: que la pasarela reintente es lo normal, no una falla.
            log.debug("El pago {} ya estaba registrado: aviso repetido", status.paymentId());
            return false;
        }

        bookingService.confirmBookingPayment(status.bookingId());
        log.info("Reserva {} confirmada por el aviso del pago {}",
                status.bookingId(), status.paymentId());
        return true;
    }

    /**
     * Deja constancia del cobro, si no la había.
     *
     * <p>Se registra <b>antes</b> de confirmar la reserva, y a propósito: la fila del pago es lo que
     * marca «este pago ya se procesó». Como el número de la pasarela es único en la base, dos avisos
     * simultáneos del mismo pago no pueden dejar dos filas — y por lo tanto tampoco dos huéspedes
     * con dos códigos QR. La comprobación previa de acá abajo evita la excepción en el caso normal;
     * la garantía, en el caso simultáneo, es la restricción de la base.
     *
     * @return {@code false} si ya estaba registrado.
     */
    private boolean record(PaymentStatus status, Long bookingId) {
        if (paymentRepository.existsByGatewayPaymentId(status.paymentId())) {
            return false;
        }
        Booking booking = bookingRepository.findById(bookingId).orElse(null);

        Payment payment = new Payment();
        payment.setGatewayPaymentId(status.paymentId());
        payment.setStatus(status.status());
        payment.setAmount(status.amount());
        payment.setPaidAt(status.paidAt());
        payment.setRecordedAt(LocalDateTime.now(clock));
        payment.setBooking(booking);
        paymentRepository.save(payment);
        return true;
    }

    /** El pago, solo si la pasarela lo conoce y lo da por aprobado. */
    private Optional<PaymentStatus> approvedPayment(String paymentId) {
        Optional<PaymentStatus> pago = paymentGateway.findPayment(paymentId);

        if (pago.isEmpty()) {
            log.warn("La pasarela no reconoce el pago {}", paymentId);
            return Optional.empty();
        }
        if (!pago.get().isApproved()) {
            log.info("El pago {} está en estado '{}': no alcanza para confirmar",
                    pago.get().paymentId(), pago.get().status());
            return Optional.empty();
        }
        return pago;
    }

    private String paymentUrlFor(BookingResponse booking) {
        return paymentGateway.createCheckout(new CheckoutRequest(
                booking.id(),
                "Reserva Zolea",
                booking.totalPrice(),
                baseUrl + "/api/bookings/success",
                baseUrl + "/api/bookings/pending",
                baseUrl + "/api/bookings/failure",
                baseUrl + "/api/bookings/notifications",
                // Desde la creación de la reserva, no desde que se pide el link: un link nuevo
                // vence a la misma hora que el primero, igual que la reserva.
                booking.createdAt().plus(Booking.PAYMENT_WINDOW)));
    }

    /** Una reserva recién creada junto con la dirección donde se paga. */
    public record Checkout(BookingResponse booking, String paymentUrl) {
    }
}
