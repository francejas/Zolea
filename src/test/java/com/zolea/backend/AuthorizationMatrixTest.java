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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Matriz de autorización: quién puede leer y escribir qué.
 *
 * <p>Todas estas pruebas fallaban antes del bloque A, y por el mismo motivo: el principal de
 * Spring Security no transportaba el {@code idClient}, así que no había con qué comparar el dueño
 * de un recurso, y el único control que aplicaba la aplicación era
 * {@code anyRequest().authenticated()} — cualquier usuario con sesión iniciada llegaba a todo. El
 * "(Admin)" que aparecía en la documentación de Swagger era texto, no una restricción.
 *
 * <p>Se cerraron juntas al introducir {@code UserPrincipal} y pasar a {@code denyAll()} por
 * defecto. Ahora son la red que impide que la autorización se afloje de nuevo.
 *
 * <p>Desde el 26/11, lo que es de otro responde 404, como lo que no existe, y el 403 queda para el
 * tipo de cuenta equivocado: un usuario común en un endpoint de administrador.
 */
@AutoConfigureMockMvc
@DisplayName("Autorización — quién accede a qué")
class AuthorizationMatrixTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    /** Un JWT válido para ese cliente, como el que devuelve POST /api/auth/login. */
    private String tokenFor(Client client) {
        return jwtUtil.generateToken(UserPrincipal.de(client));
    }

    @Test
    @DisplayName("un usuario común no puede listar todas las reservas del sistema")
    void listAllBookings_asRegularUser_forbidden() throws Exception {
        Client usuario = aClient();

        mockMvc.perform(get("/api/bookings")
                        .header("Authorization", "Bearer " + tokenFor(usuario)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("un usuario no puede leer la reserva de otro: 404, como si no existiera")
    void readSomeoneElsesBooking_notFound() throws Exception {
        Client duenio = aClient();
        Client intruso = aClient();
        RentalUnit unit = aUnit(10_000.0);
        Booking ajena = aBooking(duenio, unit, today().plusDays(10), today().plusDays(13),
                Status.CONFIRMED, now());
        aGuest(ajena, "Titular Ajeno", duenio.getDni());

        mockMvc.perform(get("/api/bookings/" + ajena.getId())
                        .header("Authorization", "Bearer " + tokenFor(intruso)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("un usuario no puede listar las reservas de otro: 404")
    void listAnotherClientsBookings_notFound() throws Exception {
        Client duenio = aClient();
        Client intruso = aClient();

        mockMvc.perform(get("/api/bookings/client/" + duenio.getIdClient())
                        .header("Authorization", "Bearer " + tokenFor(intruso)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("un usuario no puede modificar el perfil de otro: 404")
    void editSomeoneElsesProfile_notFound() throws Exception {
        Client victima = aClient();
        Client intruso = aClient();
        // JSON armado a mano en vez de serializar un ClientRequest: Jackson 3 movió
        // ObjectMapper al paquete tools.jackson y en el contexto de Boot 4 ya no hay
        // un bean del tipo com.fasterxml.jackson.databind.ObjectMapper que inyectar.
        String secuestro = """
                {"firstName":"Nombre","lastName":"Cambiado","email":"%s",
                 "password":"clave-nueva-del-intruso","phone":"%s","dni":"%s"}
                """.formatted(victima.getEmail(), victima.getPhone(), victima.getDni());

        mockMvc.perform(put("/api/clients/" + victima.getIdClient())
                        .header("Authorization", "Bearer " + tokenFor(intruso))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(secuestro))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("un usuario común no puede listar todos los clientes")
    void listAllClients_asRegularUser_forbidden() throws Exception {
        Client usuario = aClient();

        mockMvc.perform(get("/api/clients")
                        .header("Authorization", "Bearer " + tokenFor(usuario)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("un usuario no puede crear una reserva a nombre de otro: 404")
    void bookOnSomeoneElsesBehalf_notFound() throws Exception {
        Client victima = aClient();
        Client intruso = aClient();
        RentalUnit unit = aUnit(8_000.0);

        // El clientId viaja en el cuerpo del pedido. Se rechaza ANTES de llegar al servicio: si la
        // petición entrara, la prueba fallaría por el proveedor de pagos y no por la autorización,
        // que es lo que se está probando.
        String aNombreDeOtro = """
                {"startDate":"%s","endDate":"%s","clientId":%d,"rentalUnitId":%d,"guests":[]}
                """.formatted(today().plusDays(20), today().plusDays(22),
                        victima.getIdClient(), unit.getIdRentalUnit());

        mockMvc.perform(post("/api/bookings")
                        .header("Authorization", "Bearer " + tokenFor(intruso))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(aNombreDeOtro))
                .andExpect(status().isNotFound());
    }

    // Las dos que siguen son el contrapeso: sin ellas, denegar todo también pasaría la matriz.

    @Test
    @DisplayName("un usuario sí puede leer su propia reserva")
    void readOwnBooking_allowed() throws Exception {
        Client duenio = aClient();
        RentalUnit unit = aUnit(10_000.0);
        Booking propia = aBooking(duenio, unit, today().plusDays(10), today().plusDays(13),
                Status.CONFIRMED, now());
        aGuest(propia, "Titular", duenio.getDni());

        mockMvc.perform(get("/api/bookings/" + propia.getId())
                        .header("Authorization", "Bearer " + tokenFor(duenio)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("un admin sí puede listar las reservas de su balneario")
    void listAllBookings_asAdmin_allowed() throws Exception {
        Client admin = anAdminOf(aResort());

        mockMvc.perform(get("/api/bookings")
                        .header("Authorization", "Bearer " + tokenFor(admin)))
                .andExpect(status().isOk());
    }
}
