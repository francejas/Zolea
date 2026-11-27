package com.zolea.backend;

import com.jayway.jsonpath.JsonPath;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Guest;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Lo ajeno responde igual que lo que no existe (desde el 26/11).
 *
 * <p>Antes, pedir una reserva, una unidad o un cliente que existe pero es de otro respondía 403
 * («no es tuyo»), y un id que no existe, 404: probando números se sabía qué reservas había. Ahora
 * los dos son 404 con el mismo texto, y el 403 queda solo para el tipo de cuenta equivocado.
 *
 * <p>Cada caso compara la respuesta sobre lo ajeno con la del mismo pedido sobre un id que no
 * existe: tienen que ser iguales salvo el número.
 */
@AutoConfigureMockMvc
@DisplayName("Lo ajeno responde igual que lo que no existe")
class HiddenResourceTest extends IntegrationTest {

    private static final long NO_EXISTE = 987_654_321L;
    private static final String SIN_PERMISO = "No tenés permiso para realizar esta operación";

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private Resort mio;
    private RentalUnit unidad;
    private Client santi;
    private Client nati;
    private Client adminDeOtro;
    private Booking deNati;

    @BeforeEach
    void armar() {
        mio = aResort();
        unidad = aUnitIn(mio, 10_000.0);
        santi = aClient();
        nati = aClient();
        adminDeOtro = anAdminOf(aResort());
        deNati = aBooking(nati, unidad, today().plusDays(10), today().plusDays(12), Status.PENDING, now());
        aGuest(deNati, "Natalia Romero", nati.getDni());
    }

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder pedido, String cuerpo) {
        return pedido.contentType(MediaType.APPLICATION_JSON).content(cuerpo);
    }

    /** El texto del 404 que recibe quien hace el pedido. */
    private String error404(MockHttpServletRequestBuilder pedido, Client quien) throws Exception {
        String cuerpo = mockMvc.perform(pedido.header("Authorization", bearer(quien)))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return JsonPath.read(cuerpo, "$.error");
    }

    /** Sobre lo ajeno y sobre un id que no existe: 404 los dos, con el mismo texto salvo el número. */
    private void comoSiNoExistiera(Function<Long, MockHttpServletRequestBuilder> pedido, long idAjeno,
                                   Client quien) throws Exception {
        syncWithDatabase();
        String ajeno = error404(pedido.apply(idAjeno), quien);
        String inexistente = error404(pedido.apply(NO_EXISTE), quien);
        assertThat(ajeno.replace(String.valueOf(idAjeno), "N"))
                .isEqualTo(inexistente.replace(String.valueOf(NO_EXISTE), "N"));
    }

    // ---------------------------------------------------------------------
    // Una reserva de otro cliente
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("santi pide la reserva de nati, sus condiciones de cancelación y el link de pago: 404")
    void laReservaDeOtroCliente() throws Exception {
        comoSiNoExistiera(id -> get("/api/bookings/" + id), deNati.getId(), santi);
        comoSiNoExistiera(id -> get("/api/bookings/" + id + "/cancellation"), deNati.getId(), santi);
        comoSiNoExistiera(id -> post("/api/bookings/" + id + "/pay"), deNati.getId(), santi);
    }

    @Test
    @DisplayName("santi cancela la reserva de nati: 404, y la reserva no cambia")
    void cancelarLaReservaDeOtroCliente() throws Exception {
        comoSiNoExistiera(id -> patch("/api/bookings/" + id + "/cancel"), deNati.getId(), santi);

        syncWithDatabase();
        assertThat(bookingRepository.findById(deNati.getId()).orElseThrow().getStatus())
                .isEqualTo(Status.PENDING);
    }

    @Test
    @DisplayName("santi ve, califica o edita la reseña de una reserva de nati: 404")
    void laResenaDeOtroCliente() throws Exception {
        Booking terminada = aBooking(nati, unidad, today().minusDays(5), today().minusDays(3),
                Status.CONFIRMED, now().minusDays(10));

        comoSiNoExistiera(id -> get("/api/bookings/" + id + "/review"), terminada.getId(), santi);
        comoSiNoExistiera(id -> json(post("/api/bookings/" + id + "/review"), """
                {"rating":1}"""), terminada.getId(), santi);
        comoSiNoExistiera(id -> json(put("/api/bookings/" + id + "/review"), """
                {"rating":1}"""), terminada.getId(), santi);
    }

    // ---------------------------------------------------------------------
    // Lo de otro balneario
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el administrador de otro balneario pide, cancela o cobra una reserva de este: 404")
    void laReservaDeOtroBalneario() throws Exception {
        comoSiNoExistiera(id -> get("/api/bookings/" + id), deNati.getId(), adminDeOtro);
        comoSiNoExistiera(id -> get("/api/bookings/" + id + "/cancellation"), deNati.getId(), adminDeOtro);
        comoSiNoExistiera(id -> post("/api/bookings/" + id + "/pay"), deNati.getId(), adminDeOtro);
        comoSiNoExistiera(id -> patch("/api/bookings/" + id + "/cancel"), deNati.getId(), adminDeOtro);

        syncWithDatabase();
        assertThat(bookingRepository.findById(deNati.getId()).orElseThrow().getStatus())
                .isEqualTo(Status.PENDING);
    }

    @Test
    @DisplayName("el administrador de otro balneario cambia el precio, bloquea o da de baja una unidad de este: 404")
    void laUnidadDeOtroBalneario() throws Exception {
        long id = unidad.getIdRentalUnit();
        comoSiNoExistiera(u -> patch("/api/rental-units/" + u + "/price").param("newPrice", "1"), id, adminDeOtro);
        comoSiNoExistiera(u -> patch("/api/rental-units/" + u + "/block").param("isBlocked", "true"), id, adminDeOtro);
        comoSiNoExistiera(u -> patch("/api/rental-units/" + u + "/retire"), id, adminDeOtro);

        syncWithDatabase();
        RentalUnit sinCambios = rentalUnitRepository.findById(id).orElseThrow();
        assertThat(sinCambios.getIsBlocked()).isFalse();
        assertThat(sinCambios.isRetired()).isFalse();
    }

    @Test
    @DisplayName("el administrador de otro balneario reserva en mostrador una unidad de este: 404")
    void elMostradorConUnaUnidadDeOtroBalneario() throws Exception {
        String desde = today().plusDays(30).toString();
        String hasta = today().plusDays(31).toString();
        comoSiNoExistiera(u -> json(post("/api/bookings/walkin"), """
                {"startDate":"%s","endDate":"%s","rentalUnitId":%d,"guests":[],
                 "walkInName":"Marta Gómez","walkInDni":"31222333"}
                """.formatted(desde, hasta, u)), unidad.getIdRentalUnit(), adminDeOtro);
    }

    @Test
    @DisplayName("el administrador de otro balneario edita, desactiva o reactiva este balneario: 404")
    void elBalnearioDeOtroAdministrador() throws Exception {
        long id = mio.getIdResort();
        comoSiNoExistiera(r -> json(put("/api/resorts/" + r), """
                {"name":"Nombre Intruso"}"""), id, adminDeOtro);
        comoSiNoExistiera(r -> put("/api/resorts/" + r + "/inactive"), id, adminDeOtro);
        comoSiNoExistiera(r -> put("/api/resorts/" + r + "/active"), id, adminDeOtro);

        syncWithDatabase();
        Resort sinCambios = resortRepository.findById(id).orElseThrow();
        assertThat(sinCambios.getName()).isNotEqualTo("Nombre Intruso");
        assertThat(sinCambios.isActive()).isTrue();
    }

    @Test
    @DisplayName("validar el QR de una reserva de otro balneario da lo mismo que un código que no existe")
    void elQrDeOtroBalneario() throws Exception {
        Booking vigente = aBooking(nati, aUnitIn(mio, 10_000.0), today().minusDays(1), today().plusDays(1),
                Status.CONFIRMED, now().minusDays(5));
        Guest huesped = aGuest(vigente, "Natalia Romero", nati.getDni());
        syncWithDatabase();

        String ajeno = error404(post("/api/guests/validate/" + huesped.getQrToken()), adminDeOtro);
        String inexistente = error404(post("/api/guests/validate/codigo-que-no-existe"), adminDeOtro);

        assertThat(ajeno).isEqualTo(inexistente);
        syncWithDatabase();
        assertThat(guestRepository.findById(huesped.getIdGuest()).orElseThrow().enteredOn(today())).isFalse();
    }

    // ---------------------------------------------------------------------
    // La cuenta de otro cliente
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("santi pide el perfil de nati, lo edita o lista sus reservas: 404")
    void laCuentaDeOtroCliente() throws Exception {
        String cuerpo = """
                {"firstName":"Nombre","lastName":"Cambiado","email":"%s","phone":"%s","dni":"%s"}
                """.formatted(nati.getEmail(), nati.getPhone(), nati.getDni());

        comoSiNoExistiera(id -> get("/api/clients/" + id), nati.getIdClient(), santi);
        comoSiNoExistiera(id -> json(put("/api/clients/" + id), cuerpo), nati.getIdClient(), santi);
        comoSiNoExistiera(id -> get("/api/bookings/client/" + id), nati.getIdClient(), santi);

        syncWithDatabase();
        assertThat(clientRepository.findById(nati.getIdClient()).orElseThrow().getLastName())
                .isNotEqualTo("Cambiado");
    }

    @Test
    @DisplayName("santi reserva a nombre de nati: 404, y no se crea nada")
    void reservarANombreDeOtroCliente() throws Exception {
        String desde = today().plusDays(20).toString();
        String hasta = today().plusDays(21).toString();
        long antes = bookingRepository.count();

        comoSiNoExistiera(id -> json(post("/api/bookings"), """
                {"startDate":"%s","endDate":"%s","clientId":%d,"rentalUnitId":%d,"guests":[]}
                """.formatted(desde, hasta, id, unidad.getIdRentalUnit())), nati.getIdClient(), santi);

        assertThat(bookingRepository.count()).isEqualTo(antes);
    }

    @Test
    @DisplayName("el administrador de otro balneario crea una unidad en este: 404, como en uno que no existe")
    void crearUnaUnidadEnOtroBalneario() throws Exception {
        comoSiNoExistiera(r -> json(post("/api/rental-units"), """
                {"type":"TENT","identifier":"X-1","dailyPrice":9000,"isBlocked":false,"resortId":%d}
                """.formatted(r)), mio.getIdResort(), adminDeOtro);

        syncWithDatabase();
        assertThat(rentalUnitRepository.findAll())
                .noneMatch(u -> "X-1".equals(u.getIdentifier()));
    }

    @Test
    @DisplayName("un administrador pide el perfil de un cliente: 404, como cualquiera")
    void elAdministradorConLaCuentaDeUnCliente() throws Exception {
        comoSiNoExistiera(id -> get("/api/clients/" + id), nati.getIdClient(), anAdminOf(mio));
        comoSiNoExistiera(id -> get("/api/bookings/client/" + id), nati.getIdClient(), anAdminOf(mio));
    }

    // ---------------------------------------------------------------------
    // El 403 queda para el tipo de cuenta
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("un cliente en un endpoint de administrador: 403 con un texto que no nombra nada")
    void elClienteEnUnEndpointDeAdministrador() throws Exception {
        syncWithDatabase();
        for (MockHttpServletRequestBuilder pedido : new MockHttpServletRequestBuilder[] {
                get("/api/resorts/my/stats"), get("/api/bookings"), get("/api/clients"),
                patch("/api/rental-units/" + unidad.getIdRentalUnit() + "/block").param("isBlocked", "true")}) {
            mockMvc.perform(pedido.header("Authorization", bearer(santi)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error").value(SIN_PERMISO));
        }
    }

    @Test
    @DisplayName("el administrador de un balneario en algo de la cuenta de Zolea: 403 con el mismo texto")
    void elAdministradorDeUnBalnearioEnAlgoDeZolea() throws Exception {
        syncWithDatabase();
        mockMvc.perform(json(post("/api/amenities"), """
                        {"name":"Guardavidas"}""").header("Authorization", bearer(adminDeOtro)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value(SIN_PERMISO));
        mockMvc.perform(json(post("/api/resorts"), """
                        {"name":"Balneario Intruso","location":"Mar del Plata"}""")
                        .header("Authorization", bearer(adminDeOtro)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value(SIN_PERMISO));
    }

    @Test
    @DisplayName("la cuenta de Zolea en el panel de un balneario: 403 con el mismo texto")
    void laCuentaDeZoleaEnElPanel() throws Exception {
        Client zolea = theZoleaAccount();
        syncWithDatabase();
        mockMvc.perform(get("/api/resorts/my/stats").header("Authorization", bearer(zolea)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value(SIN_PERMISO));
        mockMvc.perform(get("/api/bookings/" + deNati.getId()).header("Authorization", bearer(zolea)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value(SIN_PERMISO));
    }
}
