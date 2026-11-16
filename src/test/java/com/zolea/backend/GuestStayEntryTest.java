package com.zolea.backend;

import com.zolea.backend.config.TimeConfig;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Guest;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El QR —y el DNI— sirven para entrar todas las veces que haga falta durante la estadía (15.6).
 *
 * <p>Hasta la 15.6 el segundo ingreso se rechazaba con «ya registró su ingreso», aunque fuera otro
 * día de la misma reserva. Ahora cada ingreso guarda cuándo fue el último, y {@code isEntryValidated}
 * pasa a querer decir «entró hoy».
 *
 * <p>El reloj está fijo el sábado 10/01/2026 a las 10:00 de Buenos Aires, y cada prueba lo puede
 * adelantar para ver qué pasa al día siguiente.
 */
@AutoConfigureMockMvc
@Import(GuestStayEntryTest.ClockConfig.class)
@DisplayName("Validación de ingreso — el QR sirve durante toda la estadía")
class GuestStayEntryTest extends IntegrationTest {

    private static final Instant TEN_AM = Instant.parse("2026-01-10T13:00:00Z");

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private AdjustableClock adjustableClock;

    private Resort resort;
    private String admin;

    @BeforeEach
    void setUp() {
        adjustableClock.set(TEN_AM);
        resort = aResort();
        admin = "Bearer " + jwtUtil.generateToken(UserPrincipal.de(anAdminOf(resort)));
    }

    private Booking booking(String start, String end, Status status) {
        return aBooking(aClient(), aUnitIn(resort, 10_000.0), LocalDate.parse(start), LocalDate.parse(end),
                status, now().minusDays(20));
    }

    /** Una reserva confirmada del 09/01 al 11/01: hoy, el 10, está en el medio. */
    private Guest guestOfCurrentStay(String dni) {
        return aGuest(booking("2026-01-09", "2026-01-11", Status.CONFIRMED), "Titular Vigente", dni);
    }

    private ResultActions validateQr(Guest guest) throws Exception {
        syncWithDatabase();
        return mockMvc.perform(post("/api/guests/validate/" + guest.getQrToken()).header("Authorization", admin));
    }

    private ResultActions validateDni(String dni) throws Exception {
        syncWithDatabase();
        return mockMvc.perform(post("/api/guests/validate/dni/" + dni).header("Authorization", admin));
    }

    private ResultActions bookingOf(Guest guest) throws Exception {
        syncWithDatabase();
        Long bookingId = guestRepository.findById(guest.getIdGuest()).orElseThrow().getBooking().getId();
        return mockMvc.perform(get("/api/bookings/" + bookingId).header("Authorization", admin));
    }

    // ---------------------------------------------------------------------
    // Por QR
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el mismo QR pasa dos veces el mismo día y otra vez al día siguiente")
    void qr_validatesEveryTimeDuringTheStay() throws Exception {
        Guest guest = guestOfCurrentStay("30222001");

        validateQr(guest).andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Titular Vigente"));
        adjustableClock.advance(Duration.ofHours(3));
        validateQr(guest).andExpect(status().isOk());

        adjustableClock.advance(Duration.ofDays(1));
        validateQr(guest).andExpect(status().isOk());
    }

    @Test
    @DisplayName("el día después de la fecha de fin: 400 con el motivo")
    void qr_dayAfterTheEnd_400() throws Exception {
        Guest guest = aGuest(booking("2026-01-05", "2026-01-09", Status.CONFIRMED), "Titular", "30222002");

        validateQr(guest).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("La reserva venció el 09/01/2026. El ingreso ya no está disponible."));
    }

    @Test
    @DisplayName("antes de la fecha de inicio: 400 con el motivo")
    void qr_beforeTheStart_400() throws Exception {
        Guest guest = aGuest(booking("2026-01-11", "2026-01-12", Status.CONFIRMED), "Titular", "30222003");

        validateQr(guest).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("La reserva todavía no comenzó. El ingreso se habilita el 11/01/2026."));
    }

    @Test
    @DisplayName("una reserva pendiente o cancelada: 400")
    void qr_pendingOrCanceled_400() throws Exception {
        Guest pending = aGuest(booking("2026-01-09", "2026-01-11", Status.PENDING), "Titular", "30222004");
        Guest canceled = aGuest(booking("2026-01-09", "2026-01-11", Status.CANCELED), "Titular", "30222005");

        validateQr(pending).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("La reserva asociada a este código aún figura como PENDING. Debe abonarse antes de ingresar."));
        validateQr(canceled).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("La reserva asociada a este código aún figura como CANCELED. Debe abonarse antes de ingresar."));
    }

    @Test
    @DisplayName("la reserva muestra cuándo entró por última vez y si entró hoy")
    void qr_bookingShowsLastEntryAndEnteredToday() throws Exception {
        Guest guest = guestOfCurrentStay("30222006");

        bookingOf(guest).andExpect(status().isOk())
                .andExpect(jsonPath("$.guests[0].lastEntryAt").value(nullValue()))
                .andExpect(jsonPath("$.guests[0].isEntryValidated").value(false));

        validateQr(guest).andExpect(status().isOk());

        bookingOf(guest).andExpect(status().isOk())
                .andExpect(jsonPath("$.guests[0].lastEntryAt").value("2026-01-10T10:00:00"))
                .andExpect(jsonPath("$.guests[0].isEntryValidated").value(true));

        adjustableClock.advance(Duration.ofDays(1));

        bookingOf(guest).andExpect(status().isOk())
                .andExpect(jsonPath("$.guests[0].lastEntryAt").value("2026-01-10T10:00:00"))
                .andExpect(jsonPath("$.guests[0].isEntryValidated").value(false));
    }

    // ---------------------------------------------------------------------
    // Por DNI
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("por DNI pasa dos veces el mismo día y otra vez al día siguiente")
    void dni_validatesEveryTimeDuringTheStay() throws Exception {
        guestOfCurrentStay("30222007");

        validateDni("30222007").andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Titular Vigente"));
        adjustableClock.advance(Duration.ofHours(3));
        validateDni("30222007").andExpect(status().isOk());

        adjustableClock.advance(Duration.ofDays(1));
        validateDni("30222007").andExpect(status().isOk());
    }

    @Test
    @DisplayName("por DNI, fuera de las fechas: 400 con el motivo")
    void dni_outsideTheStay_400() throws Exception {
        aGuest(booking("2026-01-05", "2026-01-09", Status.CONFIRMED), "Titular", "30222008");
        aGuest(booking("2026-01-11", "2026-01-12", Status.CONFIRMED), "Titular", "30222009");

        validateDni("30222008").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("La reserva con ese DNI venció el 09/01/2026. El ingreso ya no está disponible."));
        validateDni("30222009").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("La reserva con ese DNI todavía no comenzó. El ingreso se habilita el 11/01/2026."));
    }

    @Test
    @DisplayName("por DNI, una reserva pendiente o cancelada no cuenta: 404")
    void dni_pendingOrCanceled_notFound() throws Exception {
        aGuest(booking("2026-01-09", "2026-01-11", Status.PENDING), "Titular", "30222010");
        aGuest(booking("2026-01-09", "2026-01-11", Status.CANCELED), "Titular", "30222011");

        validateDni("30222010").andExpect(status().isNotFound());
        validateDni("30222011").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("por DNI, la reserva muestra cuándo entró por última vez y si entró hoy")
    void dni_bookingShowsLastEntryAndEnteredToday() throws Exception {
        Guest guest = guestOfCurrentStay("30222012");

        validateDni("30222012").andExpect(status().isOk());

        bookingOf(guest).andExpect(status().isOk())
                .andExpect(jsonPath("$.guests[0].lastEntryAt").value("2026-01-10T10:00:00"))
                .andExpect(jsonPath("$.guests[0].isEntryValidated").value(true));

        adjustableClock.advance(Duration.ofDays(1));

        bookingOf(guest).andExpect(status().isOk())
                .andExpect(jsonPath("$.guests[0].lastEntryAt").value("2026-01-10T10:00:00"))
                .andExpect(jsonPath("$.guests[0].isEntryValidated").value(false));
    }

    // ---------------------------------------------------------------------
    // Panel
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el panel cuenta como adentro solo a quienes entraron hoy")
    void stats_checkedInCountsOnlyTodaysEntries() throws Exception {
        Guest yesterday = guestOfCurrentStay("30222013");
        Guest today = guestOfCurrentStay("30222014");

        adjustableClock.advance(Duration.ofDays(-1));
        validateQr(yesterday).andExpect(status().isOk());
        adjustableClock.advance(Duration.ofDays(1));
        validateQr(today).andExpect(status().isOk());

        syncWithDatabase();
        mockMvc.perform(get("/api/resorts/my/stats").header("Authorization", admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.today.expectedGuests").value(2))
                .andExpect(jsonPath("$.today.checkedIn").value(1));
    }

    // ---------------------------------------------------------------------
    // Reloj
    // ---------------------------------------------------------------------

    /** Un reloj fijo que la prueba puede adelantar o atrasar. */
    static class AdjustableClock extends Clock {
        private Instant instant = TEN_AM;
        private final ZoneId zone = TimeConfig.RESORT_ZONE;

        void set(Instant instant) {
            this.instant = instant;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return zone;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return Clock.fixed(instant, zone);
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }

    @TestConfiguration
    static class ClockConfig {
        @Bean
        @Primary
        AdjustableClock adjustableClock() {
            return new AdjustableClock();
        }
    }
}
