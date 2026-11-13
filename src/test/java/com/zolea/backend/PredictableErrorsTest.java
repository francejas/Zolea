package com.zolea.backend;

import com.zolea.backend.models.Client;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Nunca un 500 ante un error previsible (RNF06).
 *
 * <p>Un pedido mal armado es culpa de quien lo arma, y lo tiene que poder corregir: le corresponde
 * un 400 que diga qué estuvo mal, en español y con la misma forma {@code {"error": "..."}} que el
 * resto de la API. Estos casos caían en el manejador genérico y salían como «Error interno del
 * servidor», que para el frontend es indistinguible de una caída de verdad.
 */
@AutoConfigureMockMvc
@DisplayName("Errores previsibles — 400 y no 500")
class PredictableErrorsTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    @Test
    @DisplayName("un id que no es un número: 400")
    void idQueNoEsNumero() throws Exception {
        Client cliente = aClient();

        mockMvc.perform(get("/api/bookings/abc").header("Authorization", bearer(cliente)))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.error").value(containsString("abc")));
    }

    @Test
    @DisplayName("un cuerpo que no es JSON válido: 400")
    void cuerpoQueNoEsJson() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\": \"a@b.com\", "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("El cuerpo del pedido no es un JSON válido."));
    }

    @Test
    @DisplayName("un parámetro obligatorio que falta: 400")
    void parametroObligatorioQueFalta() throws Exception {
        Resort resort = aResort();
        RentalUnit unidad = aUnitIn(resort, 5_000.0);
        Client admin = anAdminOf(resort);
        syncWithDatabase();

        mockMvc.perform(patch("/api/rental-units/" + unidad.getIdRentalUnit() + "/price")
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Falta el parámetro obligatorio newPrice."));
    }

    @Test
    @DisplayName("un tipo de unidad que no existe, en el cuerpo: 400 con los valores posibles")
    void tipoDeUnidadQueNoExiste_enElCuerpo() throws Exception {
        Resort resort = aResort();
        Client admin = anAdminOf(resort);
        syncWithDatabase();

        mockMvc.perform(post("/api/rental-units")
                        .header("Authorization", bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"type":"CABANA","identifier":"X-1","dailyPrice":1000,"resortId":%d}
                                """.formatted(resort.getIdResort())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "El valor CABANA no es válido para type. Puede ser: TENT, UMBRELLA."));
    }

    @Test
    @DisplayName("un tipo de unidad que no existe, en la dirección: 400 con los valores posibles")
    void tipoDeUnidadQueNoExiste_enLaDireccion() throws Exception {
        mockMvc.perform(get("/api/resorts").param("type", "CABANA"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "El parámetro type no es válido: CABANA. Puede ser: TENT, UMBRELLA."));
    }

    @Test
    @DisplayName("un número donde va un texto en el cuerpo, mal tipado: 400")
    void campoConTipoEquivocado() throws Exception {
        Resort resort = aResort();
        Client admin = anAdminOf(resort);
        syncWithDatabase();

        mockMvc.perform(post("/api/rental-units")
                        .header("Authorization", bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"type":"TENT","identifier":"X-1","dailyPrice":"caro","resortId":%d}
                                """.formatted(resort.getIdResort())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("El valor caro no es válido para dailyPrice."));
    }

    @Test
    @DisplayName("un método que la dirección no admite: 405, no 500")
    void metodoNoAdmitido() throws Exception {
        Client cliente = aClient();

        mockMvc.perform(delete("/api/bookings/1").header("Authorization", bearer(cliente)))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    @DisplayName("un cuerpo que no es JSON: 415, no 500")
    void tipoDeContenidoNoAdmitido() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.TEXT_PLAIN)
                        .content("hola"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.error").exists());
    }
}
