package com.zolea.backend;

import com.zolea.backend.dtos.guest.GuestEntryResponse;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.EntryMethod;
import com.zolea.backend.models.Guest;
import com.zolea.backend.models.GuestEntry;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.repositories.GuestEntryRepository;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.services.GuestService;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El registro de ingresos (GH-76): cada validación exitosa deja una fila, con la hora, quién validó y
 * cómo. Antes cada escaneo pisaba el anterior y del huésped quedaba solo su última entrada.
 */
@AutoConfigureMockMvc
@DisplayName("Registro de ingresos")
class GuestEntryLogTest extends IntegrationTest {

    @Autowired private GuestService guestService;
    @Autowired private GuestEntryRepository guestEntryRepository;
    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    /** Un huésped de una reserva confirmada y vigente hoy, de ese cliente y en ese balneario. */
    private Guest guestOfCurrentBooking(Client client, Resort resort, String dni) {
        Booking booking = aBooking(client, aUnitIn(resort, 10_000.0),
                today().minusDays(1), today().plusDays(1), Status.CONFIRMED, now().minusDays(5));
        return aGuest(booking, "Titular Vigente", dni);
    }

    @Test
    @DisplayName("validar dos veces la misma entrada deja dos registros, con quién validó y cómo")
    void validateTwice_leavesTwoEntries() {
        Resort resort = aResort();
        Client admin = anAdminOf(resort);
        Guest guest = guestOfCurrentBooking(aClient(), resort, "30222333");

        guestService.validateGuestEntry(guest.getQrToken(), false, resort.getIdResort(), admin.getIdClient());
        guestService.validateGuestEntryByDni("30222333", resort.getIdResort(), admin.getIdClient());
        syncWithDatabase();

        List<GuestEntry> entries = guestEntryRepository.findAll().stream()
                .filter(e -> e.getGuest().getIdGuest().equals(guest.getIdGuest()))
                .toList();
        assertThat(entries).hasSize(2);
        assertThat(entries).extracting(GuestEntry::getMethod)
                .containsExactlyInAnyOrder(EntryMethod.QR, EntryMethod.DNI);
        assertThat(entries).allSatisfy(e -> {
            assertThat(e.getBooking().getId()).isEqualTo(guest.getBooking().getId());
            assertThat(e.getValidatedBy().getIdClient()).isEqualTo(admin.getIdClient());
            assertThat(e.getEnteredAt().toLocalDate()).isEqualTo(today());
        });
        assertThat(guestRepository.findById(guest.getIdGuest()).orElseThrow().enteredOn(today())).isTrue();
    }

    @Test
    @DisplayName("el código escrito a mano queda como «código», no como QR")
    void validateTyped_isCode() {
        Resort resort = aResort();
        Guest guest = guestOfCurrentBooking(aClient(), resort, "30222334");

        guestService.validateGuestEntry(guest.getQrToken(), true, resort.getIdResort(), anAdminOf(resort).getIdClient());
        syncWithDatabase();

        assertThat(guestEntryRepository.findAll())
                .filteredOn(e -> e.getGuest().getIdGuest().equals(guest.getIdGuest()))
                .extracting(GuestEntry::getMethod)
                .containsExactly(EntryMethod.CODE);
    }

    @Test
    @DisplayName("una validación rechazada no deja registro")
    void rejectedValidation_leavesNothing() {
        Resort resort = aResort();
        Booking pending = aBooking(aClient(), aUnitIn(resort, 10_000.0),
                today().minusDays(1), today().plusDays(1), Status.PENDING, now());
        Guest guest = aGuest(pending, "Titular Impago", "30222335");
        long before = guestEntryRepository.count();

        try {
            guestService.validateGuestEntry(guest.getQrToken(), false, resort.getIdResort(), anAdminOf(resort).getIdClient());
        } catch (RuntimeException expected) {
            // la reserva no está paga
        }

        assertThat(guestEntryRepository.count()).isEqualTo(before);
    }

    @Test
    @DisplayName("los ingresos del día traen solo los del balneario, del más nuevo al más viejo")
    void resortDay_onlyItsOwn() throws Exception {
        Resort resort = aResort();
        Client admin = anAdminOf(resort);
        Guest first = guestOfCurrentBooking(aClient(), resort, "30222336");
        Guest second = guestOfCurrentBooking(aClient(), resort, "30222337");
        Resort other = aResort();
        Guest foreign = guestOfCurrentBooking(aClient(), other, "30222338");

        guestService.validateGuestEntry(first.getQrToken(), false, resort.getIdResort(), admin.getIdClient());
        guestService.validateGuestEntry(second.getQrToken(), false, resort.getIdResort(), admin.getIdClient());
        guestService.validateGuestEntry(foreign.getQrToken(), false, other.getIdResort(), anAdminOf(other).getIdClient());
        syncWithDatabase();

        List<GuestEntryResponse> day = guestService.getResortEntries(resort.getIdResort(), null);
        assertThat(day).extracting(GuestEntryResponse::idGuest)
                .containsExactly(second.getIdGuest(), first.getIdGuest());

        mockMvc.perform(get("/api/resorts/my/entries").param("date", today().toString())
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].fullName").value("Titular Vigente"))
                .andExpect(jsonPath("$[0].method").value("QR"));

        mockMvc.perform(get("/api/resorts/my/entries").param("date", today().minusDays(1).toString())
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("el administrador de otro balneario no ve los ingresos de la reserva")
    void bookingEntries_otherAdmin_denied() throws Exception {
        Resort resort = aResort();
        Guest guest = guestOfCurrentBooking(aClient(), resort, "30222339");
        guestService.validateGuestEntry(guest.getQrToken(), false, resort.getIdResort(), anAdminOf(resort).getIdClient());

        mockMvc.perform(get("/api/bookings/" + guest.getBooking().getId() + "/entries")
                        .header("Authorization", bearer(anAdminOf(resort))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        // 403 hasta que entre «Errores sin pistas» (#65), que lo pasa a 404: los dos niegan.
        mockMvc.perform(get("/api/bookings/" + guest.getBooking().getId() + "/entries")
                        .header("Authorization", bearer(anAdminOf(aResort()))))
                .andExpect(result -> assertThat(result.getResponse().getStatus()).isIn(403, 404));
    }

    @Test
    @DisplayName("el cliente ve los ingresos de su reserva y no los de otra")
    void bookingEntries_client_onlyOwn() throws Exception {
        Resort resort = aResort();
        Client owner = aClient();
        Guest guest = guestOfCurrentBooking(owner, resort, "30222340");
        Client admin = anAdminOf(resort);

        mockMvc.perform(post("/api/guests/validate/dni/30222340").header("Authorization", bearer(admin)))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/guests/validate/" + guest.getQrToken()).param("typed", "true")
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/bookings/" + guest.getBooking().getId() + "/entries")
                        .header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].idGuest").value(guest.getIdGuest()))
                .andExpect(jsonPath("$[*].method").value(org.hamcrest.Matchers.containsInAnyOrder("DNI", "CODE")));

        mockMvc.perform(get("/api/bookings/" + guest.getBooking().getId() + "/entries")
                        .header("Authorization", bearer(aClient())))
                .andExpect(result -> assertThat(result.getResponse().getStatus()).isIn(403, 404));
    }

    @Test
    @DisplayName("los ingresos de una reserva que no existe: 404")
    void bookingEntries_missing_404() throws Exception {
        mockMvc.perform(get("/api/bookings/999999/entries")
                        .header("Authorization", bearer(anAdminOf(aResort()))))
                .andExpect(status().isNotFound());
    }
}
