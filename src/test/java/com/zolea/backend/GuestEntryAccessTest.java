package com.zolea.backend;

import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Guest;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Quién puede validar un ingreso, probado por HTTP.
 *
 * <p>Validar marca el ingreso como usado y devuelve el nombre y la unidad del huésped. Hasta la 15.1
 * era público: cualquiera, sin sesión, validaba el ingreso de otra persona con su DNI. Ahora lo hace
 * solo el administrador, y sobre las reservas de su balneario. {@code GuestEntryTest} prueba las
 * reglas del ingreso llamando al servicio; estas, quién llega hasta él.
 */
@AutoConfigureMockMvc
@DisplayName("Validación de ingreso — quién puede validar")
class GuestEntryAccessTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    /** Un huésped con una reserva confirmada y vigente hoy en ese balneario. */
    private Guest guestOfCurrentBookingIn(Resort resort, String dni) {
        Booking booking = aBooking(aClient(), aUnitIn(resort, 10_000.0),
                today().minusDays(1), today().plusDays(1), Status.CONFIRMED, now().minusDays(5));
        return aGuest(booking, "Titular Vigente", dni);
    }

    private boolean entryValidated(Guest guest) {
        syncWithDatabase();
        return guestRepository.findById(guest.getIdGuest()).orElseThrow().enteredOn(today());
    }

    @Test
    @DisplayName("sin token no se puede validar: 401")
    void validate_withoutToken_401() throws Exception {
        Guest guest = guestOfCurrentBookingIn(aResort(), "30111222");

        mockMvc.perform(post("/api/guests/validate/" + guest.getQrToken()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/guests/validate/dni/30111222"))
                .andExpect(status().isUnauthorized());

        assertThat(entryValidated(guest)).isFalse();
    }

    @Test
    @DisplayName("un cliente no puede validar: 403")
    void validate_asClient_403() throws Exception {
        Guest guest = guestOfCurrentBookingIn(aResort(), "30111223");

        mockMvc.perform(post("/api/guests/validate/" + guest.getQrToken())
                        .header("Authorization", bearer(aClient())))
                .andExpect(status().isForbidden());

        assertThat(entryValidated(guest)).isFalse();
    }

    @Test
    @DisplayName("el admin de otro balneario no puede validar: 403")
    void validate_asAdminOfAnotherResort_403() throws Exception {
        Guest guest = guestOfCurrentBookingIn(aResort(), "30111224");
        Client otherAdmin = anAdminOf(aResort());

        mockMvc.perform(post("/api/guests/validate/" + guest.getQrToken())
                        .header("Authorization", bearer(otherAdmin)))
                .andExpect(status().isForbidden());

        assertThat(entryValidated(guest)).isFalse();
    }

    @Test
    @DisplayName("el admin del balneario valida, por código y por DNI")
    void validate_asAdminOfTheResort_ok() throws Exception {
        Resort resort = aResort();
        Guest byCode = guestOfCurrentBookingIn(resort, "30111225");
        Guest byDni = guestOfCurrentBookingIn(resort, "30111226");
        String admin = bearer(anAdminOf(resort));

        mockMvc.perform(post("/api/guests/validate/" + byCode.getQrToken())
                        .header("Authorization", admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Titular Vigente"));
        mockMvc.perform(post("/api/guests/validate/dni/30111226")
                        .header("Authorization", admin))
                .andExpect(status().isOk());

        assertThat(entryValidated(byCode)).isTrue();
        assertThat(entryValidated(byDni)).isTrue();
    }

    @Test
    @DisplayName("por DNI, un huésped con reserva en otro balneario no aparece")
    void validateByDni_guestOfAnotherResort_notFound() throws Exception {
        Guest elsewhere = guestOfCurrentBookingIn(aResort(), "30111227");
        Client admin = anAdminOf(aResort());

        mockMvc.perform(post("/api/guests/validate/dni/30111227")
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isNotFound());

        assertThat(entryValidated(elsewhere)).isFalse();
    }

    @Test
    @DisplayName("mi balneario sin token: 401, para que el panel mande al login")
    void myResort_withoutToken_401() throws Exception {
        mockMvc.perform(get("/api/resorts/my"))
                .andExpect(status().isUnauthorized());
    }
}
