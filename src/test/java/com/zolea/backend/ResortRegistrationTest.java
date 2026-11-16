package com.zolea.backend;

import com.zolea.backend.models.Client;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Dar de alta un balneario es de la cuenta de Zolea, como el catálogo de servicios (15.7).
 *
 * <p>Antes lo podía hacer cualquier administrador: el de Mar del Plata podía sumar balnearios a la
 * portada. Es solo por la API; no tiene pantalla.
 */
@AutoConfigureMockMvc
@DisplayName("Alta de balnearios — solo la cuenta de Zolea")
class ResortRegistrationTest extends IntegrationTest {

    private static final String MOTIVO = "Los balnearios los da de alta Zolea.";

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    private static MockHttpServletRequestBuilder alta(String nombre) {
        return post("/api/resorts").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"%s","location":"Pinamar","adminEmail":"nuevo@zolea.com"}""".formatted(nombre));
    }

    @Test
    @DisplayName("la cuenta de Zolea da de alta un balneario: 201")
    void zoleaDaDeAlta() throws Exception {
        Client zolea = theZoleaAccount();
        syncWithDatabase();

        mockMvc.perform(alta("Balneario Nuevo Zolea").header("Authorization", bearer(zolea)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.resort.name").value("Balneario Nuevo Zolea"));

        assertThat(resortRepository.findByName("Balneario Nuevo Zolea")).isPresent();
    }

    @Test
    @DisplayName("el administrador de un balneario no da de alta otro: 403 con el motivo, y no se crea nada")
    void elAdministradorDeUnBalneario_noDaDeAlta() throws Exception {
        Client admin = anAdminOf(aResort());
        syncWithDatabase();
        long antes = resortRepository.count();

        mockMvc.perform(alta("Balneario Intruso").header("Authorization", bearer(admin)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value(MOTIVO));

        syncWithDatabase();
        assertThat(resortRepository.count()).isEqualTo(antes);
        assertThat(resortRepository.findByName("Balneario Intruso")).isEmpty();
    }

    @Test
    @DisplayName("un cliente: 403; sin token: 401")
    void clienteYSinToken() throws Exception {
        Client cliente = aClient();
        syncWithDatabase();

        mockMvc.perform(alta("Balneario Cliente").header("Authorization", bearer(cliente)))
                .andExpect(status().isForbidden());
        mockMvc.perform(alta("Balneario Anonimo"))
                .andExpect(status().isUnauthorized());
    }
}
