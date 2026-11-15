package com.zolea.backend;

import com.zolea.backend.models.Booking;
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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cada administrador ve y gestiona su balneario, y solo el suyo.
 *
 * <p>Antes del bloque A.2 la pertenencia admin↔balneario era un email guardado como texto en
 * {@code Resort.adminEmail}, y ninguna consulta filtraba por balneario: el administrador de Mar del
 * Plata veía las reservas y las unidades de los cinco balnearios, y podía bloquear o re-preciar
 * cualquiera de las cien unidades del sistema.
 *
 * <p>Ahora la pertenencia es una relación real ({@code Client.managedResort}) y es lo que acota
 * tanto las lecturas como las escrituras.
 */
@AutoConfigureMockMvc
@DisplayName("Pertenencia — cada admin, su balneario")
class ResortOwnershipTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private String tokenFor(Client client) {
        return jwtUtil.generateToken(UserPrincipal.de(client));
    }

    // ---------------------------------------------------------------------
    // Lecturas acotadas
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("un admin solo ve las unidades de su balneario")
    void listUnits_onlyFromOwnResort() throws Exception {
        Resort mio = aResort();
        Resort ajeno = aResort();
        aUnitIn(mio, 5_000.0);
        aUnitIn(mio, 6_000.0);
        aUnitIn(ajeno, 7_000.0);
        Client admin = anAdminOf(mio);

        mockMvc.perform(get("/api/rental-units")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    @DisplayName("un admin solo ve las reservas de su balneario")
    void listBookings_onlyFromOwnResort() throws Exception {
        Resort mio = aResort();
        Resort ajeno = aResort();
        Client cliente = aClient();
        aBooking(cliente, aUnitIn(mio, 5_000.0),
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());
        aBooking(cliente, aUnitIn(ajeno, 5_000.0),
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());
        Client admin = anAdminOf(mio);

        mockMvc.perform(get("/api/bookings")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("la unidad informa a qué balneario pertenece")
    void unit_exposesItsResort() throws Exception {
        Resort mio = aResort();
        aUnitIn(mio, 5_000.0);
        Client admin = anAdminOf(mio);

        mockMvc.perform(get("/api/rental-units")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].resortId").value(mio.getIdResort()));
    }

    // ---------------------------------------------------------------------
    // Escrituras acotadas
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("un admin no puede cambiar el precio de una unidad de otro balneario")
    void changePriceOfAnotherResortsUnit_forbidden() throws Exception {
        Resort ajeno = aResort();
        RentalUnit unidadAjena = aUnitIn(ajeno, 7_000.0);
        Client admin = anAdminOf(aResort());

        mockMvc.perform(patch("/api/rental-units/" + unidadAjena.getIdRentalUnit() + "/price")
                        .param("newPrice", "1")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("un admin no puede bloquear una unidad de otro balneario")
    void blockAnotherResortsUnit_forbidden() throws Exception {
        Resort ajeno = aResort();
        RentalUnit unidadAjena = aUnitIn(ajeno, 7_000.0);
        Client admin = anAdminOf(aResort());

        mockMvc.perform(patch("/api/rental-units/" + unidadAjena.getIdRentalUnit() + "/block")
                        .param("isBlocked", "true")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("un admin no puede crear una unidad en otro balneario")
    void createUnitInAnotherResort_forbidden() throws Exception {
        Resort ajeno = aResort();
        Client admin = anAdminOf(aResort());

        mockMvc.perform(post("/api/rental-units")
                        .header("Authorization", "Bearer " + tokenFor(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"type":"TENT","identifier":"X-1","dailyPrice":9000,
                                 "isBlocked":false,"resortId":%d}
                                """.formatted(ajeno.getIdResort())))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("un admin sí puede cambiar el precio de una unidad propia")
    void changePriceOfOwnUnit_allowed() throws Exception {
        Resort mio = aResort();
        RentalUnit propia = aUnitIn(mio, 7_000.0);
        Client admin = anAdminOf(mio);

        mockMvc.perform(patch("/api/rental-units/" + propia.getIdRentalUnit() + "/price")
                        .param("newPrice", "8500")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dailyPrice").value(8500.0));
    }

    // ---------------------------------------------------------------------
    // A.3 — un solo modelo de identidad
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el listado público de balnearios no expone el email del administrador")
    void publicList_doesNotExposeAdminEmail() throws Exception {
        aResort();

        mockMvc.perform(get("/api/resorts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].adminEmail").doesNotExist());
    }
    // ---------------------------------------------------------------------
    // Mis clientes — los del balneario, con su historial acá
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("un admin solo ve a los clientes que reservaron en su balneario")
    void listClients_onlyFromOwnResort() throws Exception {
        Resort mio = aResort();
        Resort ajeno = aResort();
        Client mioCliente = aClient();
        Client ajenoCliente = aClient();
        aBooking(mioCliente, aUnitIn(mio, 5_000.0),
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());
        aBooking(ajenoCliente, aUnitIn(ajeno, 5_000.0),
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());
        Client admin = anAdminOf(mio);
        syncWithDatabase();

        mockMvc.perform(get("/api/clients")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].idClient").value(mioCliente.getIdClient()));
    }

    @Test
    @DisplayName("el historial de un cliente trae solo sus reservas en ese balneario")
    void clientHistory_onlyFromOwnResort() throws Exception {
        Resort mio = aResort();
        Resort ajeno = aResort();
        Client cliente = aClient();
        aBooking(cliente, aUnitIn(mio, 5_000.0),
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());
        aBooking(cliente, aUnitIn(ajeno, 5_000.0),
                today().plusDays(20), today().plusDays(22), Status.CONFIRMED, now());
        Client admin = anAdminOf(mio);
        syncWithDatabase();

        mockMvc.perform(get("/api/clients")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].bookings", hasSize(1)))
                .andExpect(jsonPath("$[0].bookingCount").value(1));
    }

    @Test
    @DisplayName("el total gastado cuenta solo las reservas confirmadas")
    void clientTotalSpent_onlyConfirmedBookings() throws Exception {
        Resort mio = aResort();
        Client cliente = aClient();
        Booking confirmada = aBooking(cliente, aUnitIn(mio, 10_000.0),
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());
        confirmada.setTotalPrice(new BigDecimal("10000.00"));
        Booking cancelada = aBooking(cliente, aUnitIn(mio, 20_000.0),
                today().plusDays(10), today().plusDays(12), Status.CANCELED, now());
        cancelada.setTotalPrice(new BigDecimal("20000.00"));
        Booking pendiente = aBooking(cliente, aUnitIn(mio, 30_000.0),
                today().plusDays(15), today().plusDays(17), Status.PENDING, now());
        pendiente.setTotalPrice(new BigDecimal("30000.00"));
        Client admin = anAdminOf(mio);
        syncWithDatabase();

        mockMvc.perform(get("/api/clients")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].totalSpent").value(10_000.0));
    }

    /**
     * La reserva de mostrador no tiene cuenta: el titular vive en {@code walkInName} y
     * {@code walkInDni}. Igual es un cliente del balneario y tiene que aparecer.
     */
    @Test
    @DisplayName("quien reservó por mostrador aparece como cliente sin cuenta")
    void walkInHolder_appearsWithoutAccount() throws Exception {
        Resort mio = aResort();
        Booking mostrador = aBooking(null, aUnitIn(mio, 5_000.0),
                today().plusDays(2), today().plusDays(4), Status.CONFIRMED, now());
        mostrador.setWalkInName("Marta Gómez");
        mostrador.setWalkInDni("30111222");
        bookingRepository.save(mostrador);
        Client admin = anAdminOf(mio);
        syncWithDatabase();

        mockMvc.perform(get("/api/clients")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].walkIn").value(true))
                .andExpect(jsonPath("$[0].idClient").doesNotExist())
                .andExpect(jsonPath("$[0].fullName").value("Marta Gómez"))
                .andExpect(jsonPath("$[0].dni").value("30111222"));
    }

    // ---------------------------------------------------------------------
    // Un admin sin balneario es un estado inválido, no un admin que ve todo
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("un admin sin balneario asignado no puede listar clientes")
    void listClients_withoutManagedResort_forbidden() throws Exception {
        aBooking(aClient(), aUnit(5_000.0),
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());
        Client admin = anAdmin();
        syncWithDatabase();

        mockMvc.perform(get("/api/clients")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("un admin sin balneario asignado no puede listar reservas")
    void listBookings_withoutManagedResort_forbidden() throws Exception {
        aBooking(aClient(), aUnit(5_000.0),
                today().plusDays(5), today().plusDays(7), Status.CONFIRMED, now());
        Client admin = anAdmin();
        syncWithDatabase();

        mockMvc.perform(get("/api/bookings")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("un admin sin balneario asignado no puede listar unidades")
    void listUnits_withoutManagedResort_forbidden() throws Exception {
        aUnit(5_000.0);
        Client admin = anAdmin();
        syncWithDatabase();

        mockMvc.perform(get("/api/rental-units")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isForbidden());
    }

    /**
     * Contrapeso: el filtro por balneario es para administradores. Un cliente elige en cualquier
     * balneario, así que sigue viendo todas las unidades. Sin esta prueba, negar de más pasaría
     * inadvertido.
     */
    @Test
    @DisplayName("un cliente sigue viendo las unidades de todos los balnearios")
    void listUnits_asClient_seesAll() throws Exception {
        aUnitIn(aResort(), 5_000.0);
        aUnitIn(aResort(), 5_000.0);
        Client cliente = aClient();
        syncWithDatabase();

        mockMvc.perform(get("/api/rental-units")
                        .header("Authorization", "Bearer " + tokenFor(cliente)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)));
    }
}
