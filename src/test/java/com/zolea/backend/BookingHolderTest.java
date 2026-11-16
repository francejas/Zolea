package com.zolea.backend;

import com.zolea.backend.models.Client;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * La reserva web siempre tiene un cliente, el de quien pide, y la lista de huéspedes no trae
 * huecos (ZOL-176).
 *
 * <p>Un cliente podía mandar la reserva web sin {@code clientId} y con los datos de mostrador
 * ({@code walkInName}, {@code walkInDni}): pasaba el control de permisos y quedaba una reserva sin
 * cliente, con link de pago, que después él mismo no podía ver. Y un {@code "guests": [null]} daba
 * 500 en lugar de 400.
 */
@AutoConfigureMockMvc
@Import(CrossAccessMatrixTest.FakeGateway.class)
@DisplayName("Reserva web con titular, y huéspedes sin huecos")
class BookingHolderTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private RentalUnit unidad;
    private Client cliente;
    private Client admin;
    private LocalDate desde;

    @BeforeEach
    void armar() {
        Resort balneario = aResort();
        unidad = aUnitIn(balneario, 10_000.0);
        cliente = aClient();
        admin = anAdminOf(balneario);
        desde = today().plusDays(20);
        syncWithDatabase();
    }

    private MockHttpServletRequestBuilder pedido(String url, Client quien, String cuerpo) {
        return post(url)
                .header("Authorization", "Bearer " + jwtUtil.generateToken(UserPrincipal.de(quien)))
                .contentType(MediaType.APPLICATION_JSON)
                .content(cuerpo);
    }

    @Test
    @DisplayName("un cliente sin clientId, con los datos de mostrador: 403, y no se crea nada")
    void sinClientId_prohibido() throws Exception {
        long antes = bookingRepository.count();

        mockMvc.perform(pedido("/api/bookings", cliente, """
                        {"startDate":"%s","endDate":"%s","rentalUnitId":%d,"guests":[],
                         "walkInName":"Marta Gómez","walkInDni":"31222333"}
                        """.formatted(desde, desde.plusDays(1), unidad.getIdRentalUnit())))
                .andExpect(status().isForbidden());

        assertThat(bookingRepository.count()).isEqualTo(antes);
    }

    @Test
    @DisplayName("un cliente con su clientId y un titular de mostrador: 400, y no se crea nada")
    void conDatosDeMostrador_rechazado() throws Exception {
        long antes = bookingRepository.count();

        mockMvc.perform(pedido("/api/bookings", cliente, """
                        {"startDate":"%s","endDate":"%s","clientId":%d,"rentalUnitId":%d,"guests":[],
                         "walkInName":"Marta Gómez"}
                        """.formatted(desde, desde.plusDays(1), cliente.getIdClient(),
                        unidad.getIdRentalUnit())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());

        assertThat(bookingRepository.count()).isEqualTo(antes);
    }

    @Test
    @DisplayName("un cliente con su clientId y solo el DNI de mostrador: 400")
    void conDniDeMostrador_rechazado() throws Exception {
        mockMvc.perform(pedido("/api/bookings", cliente, """
                        {"startDate":"%s","endDate":"%s","clientId":%d,"rentalUnitId":%d,"guests":[],
                         "walkInDni":"31222333"}
                        """.formatted(desde, desde.plusDays(1), cliente.getIdClient(),
                        unidad.getIdRentalUnit())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    @DisplayName("un huésped vacío en la reserva web: 400 con el motivo")
    void huespedVacio_web() throws Exception {
        mockMvc.perform(pedido("/api/bookings", cliente, """
                        {"startDate":"%s","endDate":"%s","clientId":%d,"rentalUnitId":%d,"guests":[null]}
                        """.formatted(desde, desde.plusDays(1), cliente.getIdClient(),
                        unidad.getIdRentalUnit())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists())
                .andExpect(jsonPath("$.campos['guests[0]']").exists());
    }

    @Test
    @DisplayName("un huésped vacío en la reserva de mostrador: 400 con el motivo")
    void huespedVacio_mostrador() throws Exception {
        mockMvc.perform(pedido("/api/bookings/walkin", admin, """
                        {"startDate":"%s","endDate":"%s","rentalUnitId":%d,"guests":[null],
                         "walkInName":"Marta Gómez","walkInDni":"31222333"}
                        """.formatted(desde, desde.plusDays(1), unidad.getIdRentalUnit())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists())
                .andExpect(jsonPath("$.campos['guests[0]']").exists());
    }

    @Test
    @DisplayName("un cliente con su clientId y huéspedes válidos sigue reservando: 201")
    void reservaValida_sigueAndando() throws Exception {
        mockMvc.perform(pedido("/api/bookings", cliente, """
                        {"startDate":"%s","endDate":"%s","clientId":%d,"rentalUnitId":%d,
                         "guests":[{"fullName":"Ana Pérez","dni":"40111222"}]}
                        """.formatted(desde, desde.plusDays(1), cliente.getIdClient(),
                        unidad.getIdRentalUnit())))
                .andExpect(status().isCreated());
    }
}
