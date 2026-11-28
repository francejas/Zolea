package com.zolea.backend;

import com.zolea.backend.models.Client;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Las reservas por delante de cada unidad (GH-77): cuántas pendientes o confirmadas que todavía no
 * terminaron tiene, y el primer día desde hoy en que está reservada. Es lo que el administrador
 * necesita saber antes de bloquearla.
 */
@AutoConfigureMockMvc
@DisplayName("Reservas por delante de cada unidad")
class UpcomingBookingsTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    private void booking(RentalUnit unit, LocalDate start, LocalDate end, Status status) {
        aBooking(aClient(), unit, start, end, status, now().minusDays(30));
    }

    private String unitPath(RentalUnit unit) {
        return "$[?(@.idRentalUnit == " + unit.getIdRentalUnit() + ")]";
    }

    @Test
    @DisplayName("cuenta las pendientes y las confirmadas que no terminaron; no las canceladas ni las terminadas")
    void countsPendingAndConfirmed_notCanceledNorFinished() throws Exception {
        Resort resort = aResort();
        RentalUnit unit = aUnitIn(resort, 10_000.0);
        LocalDate today = today();
        booking(unit, today.plusDays(10), today.plusDays(12), Status.CONFIRMED);
        booking(unit, today.plusDays(4), today.plusDays(5), Status.PENDING);
        booking(unit, today.plusDays(1), today.plusDays(2), Status.CANCELED);
        booking(unit, today.minusDays(5), today.minusDays(1), Status.CONFIRMED);
        Client admin = anAdminOf(resort);
        syncWithDatabase();

        mockMvc.perform(get("/api/rental-units").header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath(unitPath(unit) + ".upcomingBookings").value(2))
                .andExpect(jsonPath(unitPath(unit) + ".nextBookingDate").value(today.plusDays(4).toString()));
    }

    @Test
    @DisplayName("una que termina hoy sigue por delante, y si ya empezó la próxima fecha es hoy")
    void ongoingBooking_countsFromToday() throws Exception {
        Resort resort = aResort();
        RentalUnit unit = aUnitIn(resort, 10_000.0);
        LocalDate today = today();
        booking(unit, today.minusDays(2), today, Status.CONFIRMED);
        Client admin = anAdminOf(resort);
        syncWithDatabase();

        mockMvc.perform(get("/api/rental-units").header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath(unitPath(unit) + ".upcomingBookings").value(1))
                .andExpect(jsonPath(unitPath(unit) + ".nextBookingDate").value(today.toString()));
    }

    @Test
    @DisplayName("una unidad sin reservas por delante: cero y sin fecha")
    void noBookings_zeroAndNoDate() throws Exception {
        Resort resort = aResort();
        RentalUnit unit = aUnitIn(resort, 10_000.0);
        booking(unit, today().minusDays(5), today().minusDays(3), Status.CONFIRMED);
        Client admin = anAdminOf(resort);
        syncWithDatabase();

        mockMvc.perform(get("/api/rental-units").header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath(unitPath(unit) + ".upcomingBookings").value(0))
                .andExpect(jsonPath(unitPath(unit) + ".nextBookingDate").value(contains(nullValue())));
    }

    @Test
    @DisplayName("bloquear devuelve la unidad con sus reservas por delante, que siguen valiendo")
    void block_keepsTheCount() throws Exception {
        Resort resort = aResort();
        RentalUnit unit = aUnitIn(resort, 10_000.0);
        booking(unit, today().plusDays(3), today().plusDays(4), Status.CONFIRMED);
        Client admin = anAdminOf(resort);
        syncWithDatabase();

        mockMvc.perform(patch("/api/rental-units/" + unit.getIdRentalUnit() + "/block")
                        .param("isBlocked", "true")
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isBlocked").value(true))
                .andExpect(jsonPath("$.upcomingBookings").value(1))
                .andExpect(jsonPath("$.nextBookingDate").value(today().plusDays(3).toString()));
    }

    @Test
    @DisplayName("un cliente no ve las reservas por delante de las unidades")
    void client_doesNotSeeTheCount() throws Exception {
        Resort resort = aResort();
        RentalUnit unit = aUnitIn(resort, 10_000.0);
        booking(unit, today().plusDays(3), today().plusDays(4), Status.CONFIRMED);
        Client client = aClient();
        syncWithDatabase();

        mockMvc.perform(get("/api/rental-units").header("Authorization", bearer(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath(unitPath(unit) + ".upcomingBookings").value(contains(nullValue())))
                .andExpect(jsonPath(unitPath(unit) + ".nextBookingDate").value(contains(nullValue())));

        mockMvc.perform(get("/api/resorts/" + resort.getIdResort()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rentalUnits[0].upcomingBookings").value(nullValue()));
    }
}
