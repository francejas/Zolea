package com.zolea.backend;

import com.zolea.backend.config.TimeConfig;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.CanceledBy;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.services.BookingService;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cancelar con reintegro, el segundo requisito del TFI.
 *
 * <p>La política se cuenta por días, porque las reservas no tienen hora: hasta dos días antes del
 * inicio se reintegra el 100 %; el día anterior, el 50 %; desde el día de inicio no se cancela. Una
 * pendiente se cancela sin reintegro, y si cancela el balneario reintegra el 100 %. El reintegro es
 * simulado: no se toca MercadoPago.
 *
 * <p>El reloj queda fijo, así la prueba no cambia de resultado si cruza la medianoche.
 */
@AutoConfigureMockMvc
@Import(CancellationTest.FixedClock.class)
@DisplayName("Cancelación con reintegro — la política del TFI")
class CancellationTest extends IntegrationTest {

    private static final BigDecimal TOTAL = new BigDecimal("30000.00");

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private BookingService bookingService;

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    /** Una reserva de tres días que empieza dentro de {@code days} días, con un total de $ 30.000. */
    private Booking bookingStartingIn(int days, Client client, Resort resort, Status status) {
        Booking booking = aBooking(client, aUnitIn(resort, 10_000.0),
                today().plusDays(days), today().plusDays(days + 2), status, now().minusDays(10));
        booking.setTotalPrice(TOTAL);
        bookingRepository.save(booking);
        syncWithDatabase();
        return booking;
    }

    private Booking confirmedStartingIn(int days, Client client) {
        return bookingStartingIn(days, client, aResort(), Status.CONFIRMED);
    }

    private Booking reload(Booking booking) {
        syncWithDatabase();
        return bookingRepository.findById(booking.getId()).orElseThrow();
    }

    // ---------------------------------------------------------------------
    // El cliente
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("confirmada que empieza en cinco días: se cancela con el 100 %")
    void confirmed_fiveDaysBefore_fullRefund() throws Exception {
        Client client = aClient();
        Booking booking = confirmedStartingIn(5, client);

        mockMvc.perform(patch("/api/bookings/" + booking.getId() + "/cancel")
                        .header("Authorization", bearer(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELED"))
                .andExpect(jsonPath("$.refundAmount").value(30000.0))
                .andExpect(jsonPath("$.canceledBy").value("CLIENT"))
                .andExpect(jsonPath("$.canceledAt").exists());

        Booking canceled = reload(booking);
        assertThat(canceled.getStatus()).isEqualTo(Status.CANCELED);
        assertThat(canceled.getRefundAmount()).isEqualByComparingTo("30000.00");
        assertThat(canceled.getCanceledBy()).isEqualTo(CanceledBy.CLIENT);
        assertThat(canceled.getCanceledAt()).isEqualTo(now());
    }

    @Test
    @DisplayName("confirmada que empieza mañana: el 50 %")
    void confirmed_dayBefore_halfRefund() throws Exception {
        Client client = aClient();
        Booking booking = confirmedStartingIn(1, client);

        mockMvc.perform(patch("/api/bookings/" + booking.getId() + "/cancel")
                        .header("Authorization", bearer(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refundAmount").value(15000.0));

        assertThat(reload(booking).getRefundAmount()).isEqualByComparingTo("15000.00");
    }

    @Test
    @DisplayName("confirmada que empieza hoy: no se cancela, 400")
    void confirmed_startsToday_rejected() throws Exception {
        Client client = aClient();
        Booking booking = confirmedStartingIn(0, client);

        mockMvc.perform(patch("/api/bookings/" + booking.getId() + "/cancel")
                        .header("Authorization", bearer(client)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Tu estadía ya empezó: no se puede cancelar."));

        assertThat(reload(booking).getStatus()).isEqualTo(Status.CONFIRMED);
    }

    @Test
    @DisplayName("pendiente: se cancela sin reintegro, porque no se pagó")
    void pending_canceledWithoutRefund() throws Exception {
        Client client = aClient();
        Booking booking = bookingStartingIn(1, client, aResort(), Status.PENDING);

        mockMvc.perform(patch("/api/bookings/" + booking.getId() + "/cancel")
                        .header("Authorization", bearer(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELED"))
                .andExpect(jsonPath("$.refundAmount").value(nullValue()));

        assertThat(reload(booking).getRefundAmount()).isNull();
    }

    @Test
    @DisplayName("ya cancelada: 400")
    void alreadyCanceled_rejected() throws Exception {
        Client client = aClient();
        Booking booking = bookingStartingIn(5, client, aResort(), Status.CANCELED);

        mockMvc.perform(patch("/api/bookings/" + booking.getId() + "/cancel")
                        .header("Authorization", bearer(client)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("la reserva de otro cliente: 403")
    void anotherClientsBooking_forbidden() throws Exception {
        Booking booking = confirmedStartingIn(5, aClient());

        mockMvc.perform(patch("/api/bookings/" + booking.getId() + "/cancel")
                        .header("Authorization", bearer(aClient())))
                .andExpect(status().isForbidden());

        assertThat(reload(booking).getStatus()).isEqualTo(Status.CONFIRMED);
    }

    // ---------------------------------------------------------------------
    // El administrador
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el admin del balneario reintegra el 100 %, aunque empiece mañana")
    void adminOfTheResort_fullRefund() throws Exception {
        Resort resort = aResort();
        Booking booking = bookingStartingIn(1, aClient(), resort, Status.CONFIRMED);

        mockMvc.perform(patch("/api/bookings/" + booking.getId() + "/cancel")
                        .header("Authorization", bearer(anAdminOf(resort))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refundAmount").value(30000.0))
                .andExpect(jsonPath("$.canceledBy").value("ADMIN"));

        assertThat(reload(booking).getCanceledBy()).isEqualTo(CanceledBy.ADMIN);
    }

    @Test
    @DisplayName("el admin de otro balneario: 403")
    void adminOfAnotherResort_forbidden() throws Exception {
        Booking booking = confirmedStartingIn(5, aClient());

        mockMvc.perform(patch("/api/bookings/" + booking.getId() + "/cancel")
                        .header("Authorization", bearer(anAdminOf(aResort()))))
                .andExpect(status().isForbidden());

        assertThat(reload(booking).getStatus()).isEqualTo(Status.CONFIRMED);
    }

    // ---------------------------------------------------------------------
    // Cuánto se reintegraría, sin cancelar
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("GET …/cancellation dice lo mismo que después aplica PATCH …/cancel")
    void quote_matchesWhatCancelApplies() throws Exception {
        Client client = aClient();
        Booking fiveDays = confirmedStartingIn(5, client);
        Booking tomorrow = confirmedStartingIn(1, client);
        Booking today = confirmedStartingIn(0, client);

        mockMvc.perform(get("/api/bookings/" + fiveDays.getId() + "/cancellation")
                        .header("Authorization", bearer(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canCancel").value(true))
                .andExpect(jsonPath("$.refundPercent").value(100))
                .andExpect(jsonPath("$.refundAmount").value(30000.0));
        mockMvc.perform(get("/api/bookings/" + tomorrow.getId() + "/cancellation")
                        .header("Authorization", bearer(client)))
                .andExpect(jsonPath("$.canCancel").value(true))
                .andExpect(jsonPath("$.refundPercent").value(50))
                .andExpect(jsonPath("$.refundAmount").value(15000.0));
        mockMvc.perform(get("/api/bookings/" + today.getId() + "/cancellation")
                        .header("Authorization", bearer(client)))
                .andExpect(jsonPath("$.canCancel").value(false))
                .andExpect(jsonPath("$.reason").value("Tu estadía ya empezó: no se puede cancelar."));

        // Preguntar no cancela.
        assertThat(reload(fiveDays).getStatus()).isEqualTo(Status.CONFIRMED);

        mockMvc.perform(patch("/api/bookings/" + fiveDays.getId() + "/cancel")
                        .header("Authorization", bearer(client)))
                .andExpect(jsonPath("$.refundAmount").value(30000.0));
        mockMvc.perform(patch("/api/bookings/" + tomorrow.getId() + "/cancel")
                        .header("Authorization", bearer(client)))
                .andExpect(jsonPath("$.refundAmount").value(15000.0));
        mockMvc.perform(patch("/api/bookings/" + today.getId() + "/cancel")
                        .header("Authorization", bearer(client)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET …/cancellation de una reserva ajena: 403")
    void quote_ofAnotherClientsBooking_forbidden() throws Exception {
        Booking booking = confirmedStartingIn(5, aClient());

        mockMvc.perform(get("/api/bookings/" + booking.getId() + "/cancellation")
                        .header("Authorization", bearer(aClient())))
                .andExpect(status().isForbidden());
    }

    // ---------------------------------------------------------------------
    // Lo que deja la cancelación
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("la unidad vuelve a quedar libre para esas fechas")
    void cancel_freesTheUnit() throws Exception {
        Client client = aClient();
        Booking booking = confirmedStartingIn(5, client);
        Long unitId = booking.getRentalUnit().getIdRentalUnit();
        assertThat(bookingRepository.isUnitAvailable(unitId, booking.getStartDate(), booking.getEndDate()))
                .isFalse();

        mockMvc.perform(patch("/api/bookings/" + booking.getId() + "/cancel")
                        .header("Authorization", bearer(client)))
                .andExpect(status().isOk());

        syncWithDatabase();
        assertThat(bookingRepository.isUnitAvailable(unitId, booking.getStartDate(), booking.getEndDate()))
                .isTrue();
    }

    @Test
    @DisplayName("la cancelación automática de las pendientes vencidas queda como del sistema")
    void expiredPending_canceledBySystem() {
        Booking booking = aBooking(aClient(), aUnit(10_000.0),
                today().plusDays(20), today().plusDays(22), Status.PENDING, now().minusHours(25));
        syncWithDatabase();

        bookingService.cancelExpiredBookings();

        Booking canceled = reload(booking);
        assertThat(canceled.getStatus()).isEqualTo(Status.CANCELED);
        assertThat(canceled.getCanceledBy()).isEqualTo(CanceledBy.SYSTEM);
        assertThat(canceled.getCanceledAt()).isEqualTo(now());
        assertThat(canceled.getRefundAmount()).isNull();
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
}
