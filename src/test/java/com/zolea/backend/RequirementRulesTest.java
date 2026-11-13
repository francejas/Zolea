package com.zolea.backend;

import com.zolea.backend.config.TimeConfig;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Guest;
import com.zolea.backend.models.Payment;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.payments.CheckoutRequest;
import com.zolea.backend.payments.PaymentGateway;
import com.zolea.backend.payments.PaymentStatus;
import com.zolea.backend.repositories.PaymentRepository;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cuatro requisitos del registro que el backend no cumplía (15.4): no reservar en el pasado (RF13),
 * que un balneario desactivado no tome reservas (RF30), la baja de una unidad (RF32) y el pago en el
 * detalle de la reserva (RF40).
 *
 * <p>El reloj queda fijo a las 10:00 del 10/01/2026 en Buenos Aires, y la pasarela es de mentira:
 * la reserva del cliente pide un link de pago y no tiene que salir a MercadoPago.
 */
@AutoConfigureMockMvc
@Import({RequirementRulesTest.FixedClock.class, RequirementRulesTest.FakeGateway.class})
@DisplayName("Reglas del registro de requisitos — fecha pasada, balneario desactivado, baja de unidad y pagos")
class RequirementRulesTest extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 1, 10);

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private PaymentRepository paymentRepository;

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    private static String bookingJson(Long clientId, RentalUnit unit, LocalDate start, LocalDate end) {
        return """
                {"startDate":"%s","endDate":"%s","clientId":%s,"rentalUnitId":%d}
                """.formatted(start, end, clientId, unit.getIdRentalUnit());
    }

    private static String walkInJson(RentalUnit unit, LocalDate start, LocalDate end) {
        return """
                {"startDate":"%s","endDate":"%s","rentalUnitId":%d,
                 "walkInName":"Marta Gómez","walkInDni":"31222333"}
                """.formatted(start, end, unit.getIdRentalUnit());
    }

    private ResultActions bookAsClient(Client client, RentalUnit unit, LocalDate start, LocalDate end)
            throws Exception {
        syncWithDatabase();
        return mockMvc.perform(post("/api/bookings")
                .header("Authorization", bearer(client))
                .contentType(MediaType.APPLICATION_JSON)
                .content(bookingJson(client.getIdClient(), unit, start, end)));
    }

    private ResultActions bookAtTheDesk(Client admin, RentalUnit unit, LocalDate start, LocalDate end)
            throws Exception {
        syncWithDatabase();
        return mockMvc.perform(post("/api/bookings/walkin")
                .header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(walkInJson(unit, start, end)));
    }

    private ResultActions retire(Client admin, RentalUnit unit) throws Exception {
        syncWithDatabase();
        return mockMvc.perform(patch("/api/rental-units/" + unit.getIdRentalUnit() + "/retire")
                .header("Authorization", bearer(admin)));
    }

    private Resort inactive(Resort resort) {
        resort.setActive(false);
        return resortRepository.save(resort);
    }

    private RentalUnit retired(RentalUnit unit) {
        unit.setRetired(true);
        return rentalUnitRepository.save(unit);
    }

    // ---------------------------------------------------------------------
    // RF13 — no se reserva para una fecha que ya pasó
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("RF13 — fecha pasada")
    class PastDate {

        @Test
        @DisplayName("el cliente no reserva con inicio ayer: 400")
        void clientFromYesterday_isRejected() throws Exception {
            bookAsClient(aClient(), aUnit(10_000.0), TODAY.minusDays(1), TODAY.plusDays(1))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("No se puede reservar para una fecha que ya pasó."));
        }

        @Test
        @DisplayName("el cliente reserva con inicio hoy: 201")
        void clientFromToday_isCreated() throws Exception {
            bookAsClient(aClient(), aUnit(10_000.0), TODAY, TODAY.plusDays(1))
                    .andExpect(status().isCreated());
        }

        @Test
        @DisplayName("por mostrador, con inicio ayer: 400")
        void walkInFromYesterday_isRejected() throws Exception {
            Resort resort = aResort();
            RentalUnit unit = aUnitIn(resort, 10_000.0);
            bookAtTheDesk(anAdminOf(resort), unit, TODAY.minusDays(1), TODAY)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("No se puede reservar para una fecha que ya pasó."));
        }

        @Test
        @DisplayName("por mostrador, con inicio hoy: 201")
        void walkInFromToday_isCreated() throws Exception {
            Resort resort = aResort();
            RentalUnit unit = aUnitIn(resort, 10_000.0);
            bookAtTheDesk(anAdminOf(resort), unit, TODAY, TODAY)
                    .andExpect(status().isCreated());
        }
    }

    // ---------------------------------------------------------------------
    // RF30 — un balneario desactivado no toma reservas
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("RF30 — balneario desactivado")
    class InactiveResort {

        @Test
        @DisplayName("el cliente no reserva: 400")
        void clientBooking_isRejected() throws Exception {
            Resort resort = inactive(aResort());
            bookAsClient(aClient(), aUnitIn(resort, 10_000.0), TODAY.plusDays(2), TODAY.plusDays(3))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Este balneario no está tomando reservas."));
        }

        @Test
        @DisplayName("tampoco por mostrador: 400")
        void walkIn_isRejected() throws Exception {
            Resort resort = inactive(aResort());
            RentalUnit unit = aUnitIn(resort, 10_000.0);
            bookAtTheDesk(anAdminOf(resort), unit, TODAY, TODAY)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Este balneario no está tomando reservas."));
        }

        @Test
        @DisplayName("su ficha pública responde 404, y el administrador lo sigue viendo en /my")
        void publicPageIs404_butTheAdminStillSeesIt() throws Exception {
            Resort resort = inactive(aResort());
            Client admin = anAdminOf(resort);
            resort.setAdminEmail(admin.getEmail());
            resortRepository.save(resort);
            syncWithDatabase();

            mockMvc.perform(get("/api/resorts/" + resort.getIdResort()))
                    .andExpect(status().isNotFound());
            mockMvc.perform(get("/api/resorts/my").header("Authorization", bearer(admin)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.idResort").value(resort.getIdResort()))
                    .andExpect(jsonPath("$.active").value(false));
        }

        @Test
        @DisplayName("una reserva confirmada de antes se sigue validando en la entrada")
        void anEarlierConfirmedBooking_stillEnters() throws Exception {
            Resort resort = aResort();
            RentalUnit unit = aUnitIn(resort, 10_000.0);
            Booking booking = aBooking(aClient(), unit, TODAY, TODAY.plusDays(1), Status.CONFIRMED,
                    now().minusDays(5));
            Guest guest = aGuest(booking, "Ana Pérez", "30111222");
            inactive(resort);
            Client admin = anAdminOf(resort);
            syncWithDatabase();

            mockMvc.perform(post("/api/guests/validate/" + guest.getQrToken())
                            .header("Authorization", bearer(admin)))
                    .andExpect(status().isOk());
        }
    }

    // ---------------------------------------------------------------------
    // RF32 — la baja de una unidad
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("RF32 — baja de una unidad")
    class RetireUnit {

        @Test
        @DisplayName("sin reservas por delante: 200, deja de verse en la ficha y no se reserva, y sus reservas pasadas siguen")
        void withoutUpcomingBookings_isRetired() throws Exception {
            Resort resort = aResort();
            RentalUnit unit = aUnitIn(resort, 10_000.0);
            RentalUnit other = aUnitIn(resort, 10_000.0);
            Booking past = aBooking(aClient(), unit, TODAY.minusDays(8), TODAY.minusDays(6),
                    Status.CONFIRMED, now().minusDays(20));
            Client admin = anAdminOf(resort);

            retire(admin, unit)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.idRentalUnit").value(unit.getIdRentalUnit()))
                    .andExpect(jsonPath("$.retired").value(true));

            mockMvc.perform(get("/api/resorts/" + resort.getIdResort()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.rentalUnits[*].idRentalUnit",
                            contains(other.getIdRentalUnit().intValue())));

            bookAsClient(aClient(), unit, TODAY.plusDays(2), TODAY.plusDays(3))
                    .andExpect(status().isBadRequest());

            syncWithDatabase();
            assertThat(bookingRepository.findById(past.getId()).orElseThrow().getStatus())
                    .isEqualTo(Status.CONFIRMED);
        }

        @Test
        @DisplayName("sigue en el listado del administrador, con retired en true")
        void staysInTheAdminList() throws Exception {
            Resort resort = aResort();
            RentalUnit unit = retired(aUnitIn(resort, 10_000.0));
            Client admin = anAdminOf(resort);
            syncWithDatabase();

            mockMvc.perform(get("/api/rental-units").header("Authorization", bearer(admin)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.idRentalUnit == %d)].retired".formatted(unit.getIdRentalUnit()))
                            .value(true));
        }

        @Test
        @DisplayName("con una reserva confirmada la semana que viene: 400")
        void withAConfirmedBookingNextWeek_isRejected() throws Exception {
            Resort resort = aResort();
            RentalUnit unit = aUnitIn(resort, 10_000.0);
            aBooking(aClient(), unit, TODAY.plusDays(7), TODAY.plusDays(9), Status.CONFIRMED, now());

            retire(anAdminOf(resort), unit)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error")
                            .value("Tiene reservas por delante: cancelalas o esperá a que terminen."));
            syncWithDatabase();
            assertThat(rentalUnitRepository.findById(unit.getIdRentalUnit()).orElseThrow().isRetired())
                    .isFalse();
        }

        @Test
        @DisplayName("con una pendiente que termina hoy: 400; una cancelada por delante no frena la baja")
        void pendingEndingToday_blocks_canceledDoesNot() throws Exception {
            Resort resort = aResort();
            RentalUnit withPending = aUnitIn(resort, 10_000.0);
            aBooking(aClient(), withPending, TODAY.minusDays(1), TODAY, Status.PENDING, now());
            RentalUnit withCanceled = aUnitIn(resort, 10_000.0);
            aBooking(aClient(), withCanceled, TODAY.plusDays(3), TODAY.plusDays(4), Status.CANCELED, now());
            Client admin = anAdminOf(resort);

            retire(admin, withPending).andExpect(status().isBadRequest());
            retire(admin, withCanceled).andExpect(status().isOk());
        }

        @Test
        @DisplayName("el administrador de otro balneario: 403")
        void adminOfAnotherResort_isForbidden() throws Exception {
            RentalUnit unit = aUnitIn(aResort(), 10_000.0);
            retire(anAdminOf(aResort()), unit).andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("una unidad dada de baja no se bloquea, no se desbloquea ni cambia de precio: 400")
        void retiredUnit_cannotBeBlockedNorRepriced() throws Exception {
            Resort resort = aResort();
            RentalUnit unit = retired(aUnitIn(resort, 10_000.0));
            Client admin = anAdminOf(resort);
            syncWithDatabase();

            for (String blocked : new String[]{"true", "false"}) {
                mockMvc.perform(patch("/api/rental-units/" + unit.getIdRentalUnit() + "/block")
                                .param("isBlocked", blocked)
                                .header("Authorization", bearer(admin)))
                        .andExpect(status().isBadRequest());
            }
            mockMvc.perform(patch("/api/rental-units/" + unit.getIdRentalUnit() + "/price")
                            .param("newPrice", "12000")
                            .header("Authorization", bearer(admin)))
                    .andExpect(status().isBadRequest());

            syncWithDatabase();
            assertThat(rentalUnitRepository.findById(unit.getIdRentalUnit()).orElseThrow().getDailyPrice())
                    .isEqualByComparingTo("10000");
        }

        @Test
        @DisplayName("su identificador sigue ocupado: no se crea otra con el mismo")
        void itsIdentifierStaysTaken() throws Exception {
            Resort resort = aResort();
            RentalUnit unit = retired(aUnitIn(resort, 10_000.0));
            Client admin = anAdminOf(resort);
            syncWithDatabase();

            mockMvc.perform(post("/api/rental-units")
                            .header("Authorization", bearer(admin))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"type":"UMBRELLA","identifier":"%s","dailyPrice":9000,"resortId":%d}
                                    """.formatted(unit.getIdentifier(), resort.getIdResort())))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("la búsqueda no cuenta las unidades dadas de baja")
        void searchDoesNotCountRetiredUnits() throws Exception {
            Resort onlyRetired = aResort();
            retired(aUnitIn(onlyRetired, 10_000.0));
            Resort withOneLeft = aResort();
            retired(aUnitIn(withOneLeft, 10_000.0));
            aUnitIn(withOneLeft, 10_000.0);
            syncWithDatabase();

            mockMvc.perform(get("/api/resorts?from=2026-01-15&to=2026-01-17"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[*].idResort", not(hasItem(onlyRetired.getIdResort().intValue()))))
                    .andExpect(jsonPath("$[?(@.idResort == %d)].availableUnits"
                            .formatted(withOneLeft.getIdResort())).value(1));
        }
    }

    // ---------------------------------------------------------------------
    // RF40 — el pago en el detalle de la reserva
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("RF40 — pagos en el detalle")
    class PaymentsInTheDetail {

        private Payment aPayment(Booking booking, String gatewayId, String amount, LocalDateTime paidAt) {
            Payment payment = new Payment();
            payment.setBooking(booking);
            payment.setGatewayPaymentId(gatewayId);
            payment.setStatus("approved");
            payment.setAmount(new BigDecimal(amount));
            payment.setPaidAt(paidAt);
            payment.setRecordedAt(paidAt);
            return paymentRepository.save(payment);
        }

        @Test
        @DisplayName("el detalle de una reserva pagada trae sus pagos, el más nuevo primero")
        void paidBooking_bringsItsPayments() throws Exception {
            Resort resort = aResort();
            Booking booking = aBooking(aClient(), aUnitIn(resort, 10_000.0), TODAY.plusDays(2),
                    TODAY.plusDays(3), Status.CONFIRMED, now().minusDays(1));
            aPayment(booking, "mp-older", "20000.00", now().minusDays(1));
            aPayment(booking, "mp-newer", "20000.00", now().minusHours(2));
            Client admin = anAdminOf(resort);
            syncWithDatabase();

            mockMvc.perform(get("/api/bookings/" + booking.getId()).header("Authorization", bearer(admin)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.payments", hasSize(2)))
                    .andExpect(jsonPath("$.payments[0].gatewayPaymentId").value("mp-newer"))
                    .andExpect(jsonPath("$.payments[0].amount").value(20000.0))
                    .andExpect(jsonPath("$.payments[0].status").value("approved"))
                    .andExpect(jsonPath("$.payments[0].paidAt").value("2026-01-10T08:00:00"))
                    .andExpect(jsonPath("$.payments[1].gatewayPaymentId").value("mp-older"));
        }

        @Test
        @DisplayName("el de una pendiente trae la lista vacía")
        void pendingBooking_bringsAnEmptyList() throws Exception {
            Client client = aClient();
            Booking booking = aBooking(client, aUnit(10_000.0), TODAY.plusDays(2), TODAY.plusDays(3),
                    Status.PENDING, now());
            syncWithDatabase();

            mockMvc.perform(get("/api/bookings/" + booking.getId()).header("Authorization", bearer(client)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.payments").isArray())
                    .andExpect(jsonPath("$.payments", hasSize(0)));
        }
    }

    @TestConfiguration
    static class FixedClock {
        @Bean
        @Primary
        Clock fixedClock() {
            // 10:00 del 10/01/2026 en Buenos Aires.
            return Clock.fixed(Instant.parse("2026-01-10T13:00:00Z"), TimeConfig.RESORT_ZONE);
        }
    }

    /** Una pasarela que no sale a MercadoPago: devuelve un link inventado. */
    @TestConfiguration
    static class FakeGateway implements PaymentGateway {
        @Bean
        @Primary
        PaymentGateway fakePaymentGateway() {
            return this;
        }

        @Override
        public String createCheckout(CheckoutRequest request) {
            return "https://pasarela.de.mentira/checkout/" + request.bookingId();
        }

        @Override
        public Optional<PaymentStatus> findPayment(String paymentId) {
            return Optional.empty();
        }
    }
}
