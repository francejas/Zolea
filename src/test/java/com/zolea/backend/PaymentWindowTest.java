package com.zolea.backend;

import com.zolea.backend.config.TimeConfig;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.CanceledBy;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Status;
import com.zolea.backend.payments.CheckoutRequest;
import com.zolea.backend.payments.PaymentGateway;
import com.zolea.backend.payments.PaymentStatus;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.services.BookingService;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Una reserva sin pagar vence a la hora (desde el 07/11; antes, a las 24 horas).
 *
 * <p>Con 24 horas, una persona podía reservar muchas unidades sin pagar y dejarlas ocupadas un día
 * entero. Para que la hora se cumpla de verdad, la limpieza automática corre cada cinco minutos y
 * el link de pago vence a la misma hora que la reserva.
 *
 * <p>El reloj queda fijo y la pasarela es de mentira: guarda los pedidos para ver qué vencimiento
 * le llegó.
 */
@AutoConfigureMockMvc
@Import({PaymentWindowTest.FixedClock.class, PaymentWindowTest.RecordingGateway.class})
@DisplayName("Plazo de pago — la reserva pendiente vence a la hora")
class PaymentWindowTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private BookingService bookingService;
    @Autowired private RecordingGateway gateway;

    @BeforeEach
    void forgetRequests() {
        gateway.requests.clear();
    }

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    private Booking bookingCreatedMinutesAgo(long minutes, Status status) {
        Booking booking = aBooking(aClient(), aUnit(10_000.0),
                today().plusDays(10), today().plusDays(12), status, now().minusMinutes(minutes));
        syncWithDatabase();
        return booking;
    }

    private Booking reload(Booking booking) {
        syncWithDatabase();
        return bookingRepository.findById(booking.getId()).orElseThrow();
    }

    // ---------------------------------------------------------------------
    // La limpieza automática
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("una pendiente de hace 61 minutos se cancela como del sistema; una de hace 59, sigue")
    void pendingOlderThanAnHour_canceledBySystem() {
        Booking expired = bookingCreatedMinutesAgo(61, Status.PENDING);
        Booking stillOpen = bookingCreatedMinutesAgo(59, Status.PENDING);

        bookingService.cancelExpiredBookings();

        Booking canceled = reload(expired);
        assertThat(canceled.getStatus()).isEqualTo(Status.CANCELED);
        assertThat(canceled.getCanceledBy()).isEqualTo(CanceledBy.SYSTEM);
        assertThat(reload(stillOpen).getStatus()).isEqualTo(Status.PENDING);
    }

    @Test
    @DisplayName("una confirmada no se toca, sea cual sea su antigüedad")
    void confirmed_isNeverExpired() {
        Booking confirmed = bookingCreatedMinutesAgo(60 * 24 * 10, Status.CONFIRMED);

        bookingService.cancelExpiredBookings();

        assertThat(reload(confirmed).getStatus()).isEqualTo(Status.CONFIRMED);
    }

    // ---------------------------------------------------------------------
    // El link de pago vence con la reserva
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el pedido a la pasarela vence a la hora de creada la reserva")
    void checkout_expiresAnHourAfterTheBooking() throws Exception {
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);
        syncWithDatabase();
        String body = """
                {"startDate":"%s","endDate":"%s","clientId":%d,"rentalUnitId":%d,"guests":[]}
                """.formatted(today().plusDays(10), today().plusDays(12),
                        client.getIdClient(), unit.getIdRentalUnit());

        mockMvc.perform(post("/api/bookings")
                        .header("Authorization", bearer(client))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());

        assertThat(gateway.requests).hasSize(1);
        assertThat(gateway.requests.getFirst().expiresAt()).isEqualTo(now().plusHours(1));
    }

    @Test
    @DisplayName("un link nuevo a los 30 minutos vence a la misma hora que el primero")
    void retry_keepsTheBookingDeadline() throws Exception {
        Booking booking = bookingCreatedMinutesAgo(30, Status.PENDING);

        mockMvc.perform(post("/api/bookings/" + booking.getId() + "/pay")
                        .header("Authorization", bearer(booking.getClient())))
                .andExpect(status().isOk());

        assertThat(gateway.requests).hasSize(1);
        assertThat(gateway.requests.getFirst().expiresAt()).isEqualTo(now().plusMinutes(30));
    }

    @Test
    @DisplayName("una reserva cancelada no genera link nuevo: 400")
    void retry_ofACanceledBooking_rejected() throws Exception {
        Booking booking = bookingCreatedMinutesAgo(30, Status.CANCELED);

        mockMvc.perform(post("/api/bookings/" + booking.getId() + "/pay")
                        .header("Authorization", bearer(booking.getClient())))
                .andExpect(status().isBadRequest());

        assertThat(gateway.requests).isEmpty();
    }

    @Test
    @DisplayName("una pendiente de hace 61 minutos que la limpieza no canceló todavía no genera link: 400")
    void retry_afterTheHourBeforeTheCleanup_rejected() throws Exception {
        Booking booking = bookingCreatedMinutesAgo(61, Status.PENDING);

        mockMvc.perform(post("/api/bookings/" + booking.getId() + "/pay")
                        .header("Authorization", bearer(booking.getClient())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("La reserva venció."));

        assertThat(gateway.requests).isEmpty();
    }

    @Test
    @DisplayName("a los 60 minutos justos ya venció, igual que para la limpieza")
    void retry_atExactlyTheHour_rejected() throws Exception {
        Booking booking = bookingCreatedMinutesAgo(60, Status.PENDING);

        mockMvc.perform(post("/api/bookings/" + booking.getId() + "/pay")
                        .header("Authorization", bearer(booking.getClient())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("La reserva venció."));

        assertThat(gateway.requests).isEmpty();
    }

    /** El 10 de enero de 2026 a las 10 de la mañana, en la zona del balneario. */
    @TestConfiguration
    static class FixedClock {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(Instant.parse("2026-01-10T13:00:00Z"), TimeConfig.RESORT_ZONE);
        }
    }

    /** Una pasarela que guarda cada pedido de cobro, para ver con qué vencimiento llegó. */
    @TestConfiguration
    static class RecordingGateway implements PaymentGateway {

        final List<CheckoutRequest> requests = new ArrayList<>();

        @Bean
        @Primary
        PaymentGateway recordingPaymentGateway() {
            return this;
        }

        @Override
        public String createCheckout(CheckoutRequest request) {
            requests.add(request);
            return "https://pasarela.de.mentira/checkout/" + request.bookingId();
        }

        @Override
        public Optional<PaymentStatus> findPayment(String paymentId) {
            return Optional.empty();
        }
    }
}
