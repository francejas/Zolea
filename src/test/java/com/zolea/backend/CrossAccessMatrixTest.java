package com.zolea.backend;

import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.payments.CheckoutRequest;
import com.zolea.backend.payments.PaymentGateway;
import com.zolea.backend.payments.PaymentStatus;
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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.LocalDate;
import java.util.Optional;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * La matriz de accesos cruzados (RNF03): cada administrador, solo con lo de su balneario.
 *
 * <p>Para cada operación protegida prueba los cuatro casos que pide el registro de requisitos:
 * sin token (401), con un cliente ajeno (403), con el administrador de otro balneario (403) y con
 * quien sí puede (2xx). El último es el contrapeso: sin él, cerrar todo también pasaría la matriz.
 *
 * <p>Los casos que se niegan van primero y el permitido al final, porque el permitido puede
 * modificar los datos —desactiva el balneario, crea la reserva— y los demás tienen que ver la
 * situación de partida.
 */
@AutoConfigureMockMvc
@Import(CrossAccessMatrixTest.FakeGateway.class)
@DisplayName("Matriz de accesos cruzados — cada uno, con lo suyo")
class CrossAccessMatrixTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private Resort mio;
    private Resort ajeno;
    private RentalUnit unidad;
    private Client cliente;
    private Client otroCliente;
    private Client adminDelBalneario;
    private Client adminDeOtro;
    private Booking reserva;

    @BeforeEach
    void armarDosBalnearios() {
        mio = aResort();
        ajeno = aResort();
        unidad = aUnitIn(mio, 10_000.0);
        aUnitIn(ajeno, 10_000.0);
        cliente = aClient();
        otroCliente = aClient();
        adminDelBalneario = anAdminOf(mio);
        adminDeOtro = anAdminOf(ajeno);
        // Pendiente y recién creada: así también se le puede pedir un link de pago.
        reserva = aBooking(cliente, unidad, today().plusDays(10), today().plusDays(12),
                Status.PENDING, now());
        aGuest(reserva, "Titular", cliente.getDni());
    }

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    /** Sin token, con cada actor que no puede, y al final con el que sí. */
    private void matriz(Supplier<MockHttpServletRequestBuilder> pedido, int esperadoPermitido,
                        Client permitido, Client... negados) throws Exception {
        syncWithDatabase();
        mockMvc.perform(pedido.get()).andExpect(status().isUnauthorized());
        for (Client negado : negados) {
            mockMvc.perform(pedido.get().header("Authorization", bearer(negado)))
                    .andExpect(status().isForbidden());
        }
        mockMvc.perform(pedido.get().header("Authorization", bearer(permitido)))
                .andExpect(status().is(esperadoPermitido));
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder pedido, String cuerpo) {
        return pedido.contentType(MediaType.APPLICATION_JSON).content(cuerpo);
    }

    // ---------------------------------------------------------------------
    // Balnearios por id
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("editar un balneario por id: solo su administrador")
    void editarBalneario() throws Exception {
        matriz(() -> json(put("/api/resorts/" + mio.getIdResort()), """
                        {"name":"Nombre Nuevo"}"""),
                200, adminDelBalneario, cliente, adminDeOtro);
    }

    @Test
    @DisplayName("desactivar un balneario: solo su administrador")
    void desactivarBalneario() throws Exception {
        matriz(() -> put("/api/resorts/" + mio.getIdResort() + "/inactive"),
                200, adminDelBalneario, cliente, adminDeOtro);
    }

    @Test
    @DisplayName("reactivar un balneario: solo su administrador")
    void reactivarBalneario() throws Exception {
        matriz(() -> put("/api/resorts/" + mio.getIdResort() + "/active"),
                200, adminDelBalneario, cliente, adminDeOtro);
    }

    // ---------------------------------------------------------------------
    // Una reserva
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("ver una reserva: su dueño")
    void verReserva_elDuenio() throws Exception {
        matriz(() -> get("/api/bookings/" + reserva.getId()),
                200, cliente, otroCliente, adminDeOtro);
    }

    @Test
    @DisplayName("ver una reserva: el administrador de su balneario")
    void verReserva_suAdministrador() throws Exception {
        matriz(() -> get("/api/bookings/" + reserva.getId()),
                200, adminDelBalneario, otroCliente, adminDeOtro);
    }

    @Test
    @DisplayName("las condiciones de cancelación: su dueño o el administrador de su balneario")
    void condicionesDeCancelacion() throws Exception {
        matriz(() -> get("/api/bookings/" + reserva.getId() + "/cancellation"),
                200, cliente, otroCliente, adminDeOtro);
        mockMvc.perform(get("/api/bookings/" + reserva.getId() + "/cancellation")
                        .header("Authorization", bearer(adminDelBalneario)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("pedir el link de pago: su dueño o el administrador de su balneario")
    void linkDePago() throws Exception {
        matriz(() -> post("/api/bookings/" + reserva.getId() + "/pay"),
                200, cliente, otroCliente, adminDeOtro);
        mockMvc.perform(post("/api/bookings/" + reserva.getId() + "/pay")
                        .header("Authorization", bearer(adminDelBalneario)))
                .andExpect(status().isOk());
    }

    // ---------------------------------------------------------------------
    // Un cliente
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("las reservas de un cliente: solo él, ni siquiera el administrador de su balneario")
    void reservasDeUnCliente() throws Exception {
        matriz(() -> get("/api/bookings/client/" + cliente.getIdClient()),
                200, cliente, otroCliente, adminDeOtro, adminDelBalneario);
    }

    @Test
    @DisplayName("ver el perfil de un cliente: solo él")
    void verPerfil() throws Exception {
        matriz(() -> get("/api/clients/" + cliente.getIdClient()),
                200, cliente, otroCliente, adminDeOtro, adminDelBalneario);
    }

    @Test
    @DisplayName("editar el perfil de un cliente: solo él")
    void editarPerfil() throws Exception {
        String cuerpo = """
                {"firstName":"Nombre","lastName":"Cambiado","email":"%s","phone":"%s","dni":"%s"}
                """.formatted(cliente.getEmail(), cliente.getPhone(), cliente.getDni());
        matriz(() -> json(put("/api/clients/" + cliente.getIdClient()), cuerpo),
                200, cliente, otroCliente, adminDeOtro, adminDelBalneario);
    }

    @Test
    @DisplayName("un administrador sí ve su propio perfil")
    void elAdministradorVeSuPerfil() throws Exception {
        syncWithDatabase();
        mockMvc.perform(get("/api/clients/" + adminDelBalneario.getIdClient())
                        .header("Authorization", bearer(adminDelBalneario)))
                .andExpect(status().isOk());
    }

    // ---------------------------------------------------------------------
    // Reservar
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("reservar a nombre de un cliente: solo él; un administrador no, para eso está el mostrador")
    void reservarWeb() throws Exception {
        LocalDate desde = today().plusDays(20);
        String cuerpo = """
                {"startDate":"%s","endDate":"%s","clientId":%d,"rentalUnitId":%d,"guests":[]}
                """.formatted(desde, desde.plusDays(1), cliente.getIdClient(), unidad.getIdRentalUnit());
        matriz(() -> json(post("/api/bookings"), cuerpo),
                201, cliente, otroCliente, adminDeOtro, adminDelBalneario);
    }

    @Test
    @DisplayName("reservar por la web sin clientId: nadie, ni siquiera con los datos de mostrador")
    void reservarWebSinClientId() throws Exception {
        LocalDate desde = today().plusDays(25);
        String cuerpo = """
                {"startDate":"%s","endDate":"%s","rentalUnitId":%d,"guests":[],
                 "walkInName":"Marta Gómez","walkInDni":"31222333"}
                """.formatted(desde, desde.plusDays(1), unidad.getIdRentalUnit());
        syncWithDatabase();
        long antes = bookingRepository.count();

        mockMvc.perform(json(post("/api/bookings"), cuerpo)).andExpect(status().isUnauthorized());
        for (Client negado : new Client[] {cliente, otroCliente, adminDeOtro, adminDelBalneario}) {
            mockMvc.perform(json(post("/api/bookings"), cuerpo).header("Authorization", bearer(negado)))
                    .andExpect(status().isForbidden());
        }
        assertThat(bookingRepository.count()).isEqualTo(antes);
    }

    @Test
    @DisplayName("la reserva de mostrador: solo sobre unidades del balneario del administrador")
    void reservaDeMostrador() throws Exception {
        LocalDate desde = today().plusDays(30);
        String cuerpo = """
                {"startDate":"%s","endDate":"%s","rentalUnitId":%d,"guests":[],
                 "walkInName":"Marta Gómez","walkInDni":"31222333"}
                """.formatted(desde, desde.plusDays(1), unidad.getIdRentalUnit());
        matriz(() -> json(post("/api/bookings/walkin"), cuerpo),
                201, adminDelBalneario, cliente, adminDeOtro);
    }

    // ---------------------------------------------------------------------
    // Calificar
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("calificar: solo el cliente dueño; un administrador no, aunque la reserva sea suya")
    void calificar() throws Exception {
        Booking terminada = aBooking(cliente, unidad, today().minusDays(5), today().minusDays(3),
                Status.CONFIRMED, now().minusDays(10));
        Booking delAdministrador = aBooking(adminDeOtro, unidad, today().minusDays(5),
                today().minusDays(3), Status.CONFIRMED, now().minusDays(10));
        String cuerpo = """
                {"rating":5}""";

        matriz(() -> json(post("/api/bookings/" + terminada.getId() + "/review"), cuerpo),
                201, cliente, otroCliente, adminDeOtro, adminDelBalneario);
        mockMvc.perform(json(post("/api/bookings/" + delAdministrador.getId() + "/review"), cuerpo)
                        .header("Authorization", bearer(adminDeOtro)))
                .andExpect(status().isForbidden());
    }

    /** Una pasarela que no sale a internet: devuelve siempre la misma dirección de pago. */
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
