package com.zolea.backend;

import com.zolea.backend.config.TimeConfig;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Guest;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
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
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Las estadísticas del balneario, el cuarto requisito del TFI del lado del backend: los números que
 * dibuja el Panel con gráficos.
 *
 * <p>Solo cuentan las reservas confirmadas, salvo {@code pendingBookings}, y siempre del balneario
 * de quien pide. El reloj queda fijo el sábado 10 de enero de 2026, así que sin fechas el rango va
 * del 1 de diciembre de 2025 al 28 de febrero de 2026.
 */
@AutoConfigureMockMvc
@Import(ResortStatsTest.FixedClock.class)
@DisplayName("Estadísticas del balneario — los números del Panel")
class ResortStatsTest extends IntegrationTest {

    private static final String STATS = "/api/resorts/my/stats";

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    private LocalDate day(String date) {
        return LocalDate.parse(date);
    }

    private Booking booking(RentalUnit unit, String start, String end, Status status) {
        return aBooking(aClient(), unit, day(start), day(end), status, now().minusDays(20));
    }

    private Booking confirmed(RentalUnit unit, String start, String end) {
        return booking(unit, start, end, Status.CONFIRMED);
    }

    private Booking withTotal(Booking booking, String total) {
        booking.setTotalPrice(new BigDecimal(total));
        return bookingRepository.save(booking);
    }

    private RentalUnit blocked(RentalUnit unit) {
        unit.setIsBlocked(true);
        return rentalUnitRepository.save(unit);
    }

    private ResultActions stats(Client admin, String query) throws Exception {
        syncWithDatabase();
        return mockMvc.perform(get(STATS + query).header("Authorization", bearer(admin)));
    }

    // ---------------------------------------------------------------------
    // Hoy
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("hoy: una confirmada que incluye hoy, con tres personas y una adentro, da 1, 3 y 1")
    void today_countsTheConfirmedBookingThatIncludesToday() throws Exception {
        Resort resort = aResort();
        Booking active = confirmed(aUnitIn(resort, 10_000.0), "2026-01-09", "2026-01-12");
        Guest inside = aGuest(active, "Titular", "40000001");
        inside.setLastEntryAt(now());
        guestRepository.save(inside);
        aGuest(active, "Acompañante uno", "40000002");
        aGuest(active, "Acompañante dos", "40000003");

        // Ninguna de estas suma en las tres primeras; la pendiente suma en pendingBookings.
        aGuest(booking(aUnitIn(resort, 10_000.0), "2026-01-10", "2026-01-11", Status.PENDING), "P", "40000004");
        aGuest(booking(aUnitIn(resort, 10_000.0), "2026-01-10", "2026-01-11", Status.CANCELED), "C", "40000005");
        aGuest(confirmed(aUnitIn(resort, 10_000.0), "2026-01-07", "2026-01-09"), "Ayer", "40000006");

        stats(anAdminOf(resort), "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.today.activeBookings").value(1))
                .andExpect(jsonPath("$.today.expectedGuests").value(3))
                .andExpect(jsonPath("$.today.checkedIn").value(1))
                .andExpect(jsonPath("$.today.pendingBookings").value(1));
    }

    @Test
    @DisplayName("hoy no depende del rango: con un rango de marzo sigue contando la de hoy")
    void today_doesNotDependOnTheRange() throws Exception {
        Resort resort = aResort();
        aGuest(confirmed(aUnitIn(resort, 10_000.0), "2026-01-09", "2026-01-12"), "Titular", "40000011");

        stats(anAdminOf(resort), "?from=2026-03-01&to=2026-03-10")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.today.activeBookings").value(1))
                .andExpect(jsonPath("$.today.expectedGuests").value(1));
    }

    @Test
    @DisplayName("hoy: con 10 unidades, una bloqueada y 3 ocupadas, quedan 6 libres")
    void today_freeUnits() throws Exception {
        Resort resort = aResort();
        List<RentalUnit> units = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            units.add(aUnitIn(resort, 10_000.0));
        }
        blocked(units.get(0));
        confirmed(units.get(1), "2026-01-10", "2026-01-10");
        confirmed(units.get(2), "2026-01-08", "2026-01-11");
        confirmed(units.get(3), "2026-01-10", "2026-01-15");
        // Una pendiente no ocupa la unidad para este número.
        booking(units.get(4), "2026-01-10", "2026-01-11", Status.PENDING);

        stats(anAdminOf(resort), "")
                .andExpect(jsonPath("$.today.freeUnits").value(6));
    }

    // ---------------------------------------------------------------------
    // Ocupación
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("ocupación: un elemento por día, dos unidades el mismo día dan 2 y la bloqueada no entra en el total")
    void occupancyByDay() throws Exception {
        Resort resort = aResort();
        RentalUnit first = aUnitIn(resort, 10_000.0);
        RentalUnit second = aUnitIn(resort, 10_000.0);
        blocked(aUnitIn(resort, 10_000.0));
        confirmed(first, "2026-01-03", "2026-01-05");
        confirmed(second, "2026-01-05", "2026-01-06");

        stats(anAdminOf(resort), "?from=2026-01-01&to=2026-01-10")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.occupancyByDay", hasSize(10)))
                .andExpect(jsonPath("$.occupancyByDay[0].date").value("2026-01-01"))
                .andExpect(jsonPath("$.occupancyByDay[0].occupiedUnits").value(0))
                .andExpect(jsonPath("$.occupancyByDay[0].totalUnits").value(2))
                .andExpect(jsonPath("$.occupancyByDay[3].occupiedUnits").value(1))
                .andExpect(jsonPath("$.occupancyByDay[4].date").value("2026-01-05"))
                .andExpect(jsonPath("$.occupancyByDay[4].occupiedUnits").value(2))
                .andExpect(jsonPath("$.occupancyByDay[9].date").value("2026-01-10"))
                .andExpect(jsonPath("$.occupancyByDay[9].occupiedUnits").value(0));
    }

    // ---------------------------------------------------------------------
    // Ingresos
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("ingresos: suma entera en el mes en que empieza, un mes vacío da 0 y una cancelada no suma")
    void incomeByMonth() throws Exception {
        Resort resort = aResort();
        RentalUnit unit = aUnitIn(resort, 10_000.0);
        withTotal(confirmed(unit, "2026-01-03", "2026-01-04"), "20000.00");
        // Del 31/01 al 02/02: suma entera en enero.
        withTotal(confirmed(unit, "2026-01-31", "2026-02-02"), "234000.00");
        withTotal(booking(unit, "2026-03-05", "2026-03-06", Status.CANCELED), "50000.00");

        stats(anAdminOf(resort), "?from=2026-01-01&to=2026-03-31")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.incomeByMonth", hasSize(3)))
                .andExpect(jsonPath("$.incomeByMonth[0].month").value("2026-01"))
                .andExpect(jsonPath("$.incomeByMonth[0].income").value(254000.0))
                .andExpect(jsonPath("$.incomeByMonth[1].month").value("2026-02"))
                .andExpect(jsonPath("$.incomeByMonth[1].income").value(0.0))
                .andExpect(jsonPath("$.incomeByMonth[2].month").value("2026-03"))
                .andExpect(jsonPath("$.incomeByMonth[2].income").value(0.0));
    }

    // ---------------------------------------------------------------------
    // Unidades más reservadas
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("unidades más reservadas: los días dentro del rango, de más a menos y cortadas en 5")
    void topUnits() throws Exception {
        Resort resort = aResort();
        RentalUnit six = aUnitIn(resort, 10_000.0);
        RentalUnit five = aUnitIn(resort, 10_000.0);
        RentalUnit fourA = aUnitIn(resort, 10_000.0);
        RentalUnit fourB = aUnitIn(resort, 10_000.0);
        RentalUnit two = aUnitIn(resort, 10_000.0);
        RentalUnit one = aUnitIn(resort, 10_000.0);
        aUnitIn(resort, 10_000.0); // sin reservas: no va

        // Del 28/12 al 05/01: dentro del rango quedan del 01/01 al 05/01, cinco días, más uno.
        confirmed(six, "2025-12-28", "2026-01-05");
        confirmed(six, "2026-01-20", "2026-01-20");
        confirmed(five, "2026-01-10", "2026-01-14");
        confirmed(fourA, "2026-01-10", "2026-01-13");
        confirmed(fourB, "2026-01-20", "2026-01-23");
        confirmed(two, "2026-01-10", "2026-01-11");
        confirmed(one, "2026-01-31", "2026-02-03");

        stats(anAdminOf(resort), "?from=2026-01-01&to=2026-01-31")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.topUnits", hasSize(5)))
                .andExpect(jsonPath("$.topUnits[0].idRentalUnit").value(six.getIdRentalUnit()))
                .andExpect(jsonPath("$.topUnits[0].days").value(6))
                .andExpect(jsonPath("$.topUnits[0].identifier").value(six.getIdentifier()))
                .andExpect(jsonPath("$.topUnits[0].type").value("UMBRELLA"))
                .andExpect(jsonPath("$.topUnits[1].idRentalUnit").value(five.getIdRentalUnit()))
                // Empatan en 4: van por identificador.
                .andExpect(jsonPath("$.topUnits[2].idRentalUnit").value(fourA.getIdRentalUnit()))
                .andExpect(jsonPath("$.topUnits[3].idRentalUnit").value(fourB.getIdRentalUnit()))
                .andExpect(jsonPath("$.topUnits[4].idRentalUnit").value(two.getIdRentalUnit()));
    }

    // ---------------------------------------------------------------------
    // El rango
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("sin fechas: del primer día del mes pasado al último del que viene")
    void defaultRange() throws Exception {
        stats(anAdminOf(aResort()), "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.from").value("2025-12-01"))
                .andExpect(jsonPath("$.to").value("2026-02-28"))
                .andExpect(jsonPath("$.occupancyByDay", hasSize(90)))
                .andExpect(jsonPath("$.incomeByMonth[*].month", contains("2025-12", "2026-01", "2026-02")));
    }

    @Test
    @DisplayName("un rango de 366 días se acepta")
    void range_of366Days_accepted() throws Exception {
        stats(anAdminOf(aResort()), "?from=2026-01-01&to=2027-01-01")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.occupancyByDay", hasSize(366)));
    }

    @Test
    @DisplayName("los cuatro 400: al revés, una sola fecha, más de 366 días y una fecha mal escrita")
    void invalidRanges_badRequest() throws Exception {
        Client admin = anAdminOf(aResort());

        stats(admin, "?from=2026-02-01&to=2026-01-01")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
        stats(admin, "?from=2026-01-01")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
        stats(admin, "?to=2026-01-01")
                .andExpect(status().isBadRequest());
        stats(admin, "?from=2026-01-01&to=2027-01-02")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
        stats(admin, "?from=ayer&to=2026-01-01")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    // ---------------------------------------------------------------------
    // Quién lo ve
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("sin token: 401")
    void withoutToken_unauthorized() throws Exception {
        mockMvc.perform(get(STATS)).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("con un cliente: 403")
    void client_forbidden() throws Exception {
        stats(aClient(), "").andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("un admin sin balneario: 403")
    void adminWithoutResort_forbidden() throws Exception {
        stats(anAdmin(), "").andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("una reserva de otro balneario no aparece en ningún número")
    void anotherResortsBooking_isNotCounted() throws Exception {
        Resort mine = aResort();
        aUnitIn(mine, 10_000.0);
        Resort other = aResort();
        RentalUnit otherUnit = aUnitIn(other, 10_000.0);
        Booking theirs = withTotal(confirmed(otherUnit, "2026-01-09", "2026-01-12"), "40000.00");
        aGuest(theirs, "De otro balneario", "40000021");
        booking(otherUnit, "2026-01-20", "2026-01-21", Status.PENDING);

        stats(anAdminOf(mine), "?from=2026-01-01&to=2026-01-31")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.today.activeBookings").value(0))
                .andExpect(jsonPath("$.today.expectedGuests").value(0))
                .andExpect(jsonPath("$.today.pendingBookings").value(0))
                .andExpect(jsonPath("$.today.freeUnits").value(1))
                .andExpect(jsonPath("$.occupancyByDay[9].occupiedUnits").value(0))
                .andExpect(jsonPath("$.occupancyByDay[9].totalUnits").value(1))
                .andExpect(jsonPath("$.incomeByMonth[0].income").value(0.0))
                .andExpect(jsonPath("$.topUnits", hasSize(0)));
    }

    /** El sábado 10 de enero de 2026 a las 10 de la mañana, en la zona del balneario. */
    @TestConfiguration
    static class FixedClock {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(Instant.parse("2026-01-10T13:00:00Z"), TimeConfig.RESORT_ZONE);
        }
    }
}
