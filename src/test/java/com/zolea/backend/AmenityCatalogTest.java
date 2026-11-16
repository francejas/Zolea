package com.zolea.backend;

import com.zolea.backend.models.Amenity;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Resort;
import com.zolea.backend.repositories.AmenityRepository;
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

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El catálogo de servicios es uno solo para todos los balnearios, y lo administra la cuenta de
 * Zolea: un administrador sin balneario asignado (15.7).
 *
 * <p>Hasta acá cualquier administrador creaba, renombraba y borraba servicios, y borrar uno se lo
 * sacaba a los cinco balnearios. El administrador de un balneario solo elige cuáles ofrece el suyo,
 * en {@code PUT /api/resorts/my}.
 */
@AutoConfigureMockMvc
@DisplayName("Catálogo de servicios — solo lo administra la cuenta de Zolea")
class AmenityCatalogTest extends IntegrationTest {

    private static final String MOTIVO = "Los servicios los carga Zolea. Elegí los tuyos en Mi balneario.";

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private AmenityRepository amenityRepository;

    private Client zolea;
    private Client adminDelBalneario;
    private Client cliente;
    private Resort balneario;
    private Amenity servicio;

    @BeforeEach
    void armarElCatalogo() {
        zolea = theZoleaAccount();
        balneario = aResort();
        adminDelBalneario = anAdminOf(balneario);
        cliente = aClient();
        servicio = new Amenity();
        servicio.setName("Duchas de prueba");
        servicio = amenityRepository.save(servicio);
    }

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder pedido, String cuerpo) {
        return pedido.contentType(MediaType.APPLICATION_JSON).content(cuerpo);
    }

    private MockHttpServletRequestBuilder crear() {
        return json(post("/api/amenities"), """
                {"name":"Guardavidas"}""");
    }

    private MockHttpServletRequestBuilder renombrar() {
        return json(put("/api/amenities/" + servicio.getIdAmenity()), """
                {"name":"Duchas calientes"}""");
    }

    private MockHttpServletRequestBuilder borrar() {
        return delete("/api/amenities/" + servicio.getIdAmenity());
    }

    // ---------------------------------------------------------------------
    // La cuenta de Zolea
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("la cuenta de Zolea crea un servicio: 201")
    void zoleaCrea() throws Exception {
        syncWithDatabase();
        mockMvc.perform(crear().header("Authorization", bearer(zolea)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Guardavidas"));
    }

    @Test
    @DisplayName("la cuenta de Zolea renombra un servicio: 200")
    void zoleaRenombra() throws Exception {
        syncWithDatabase();
        mockMvc.perform(renombrar().header("Authorization", bearer(zolea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Duchas calientes"));
    }

    @Test
    @DisplayName("la cuenta de Zolea borra un servicio: 204")
    void zoleaBorra() throws Exception {
        syncWithDatabase();
        mockMvc.perform(borrar().header("Authorization", bearer(zolea)))
                .andExpect(status().isNoContent());

        syncWithDatabase();
        assertThat(amenityRepository.findById(servicio.getIdAmenity())).isEmpty();
    }

    // ---------------------------------------------------------------------
    // El administrador de un balneario
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el administrador de un balneario no crea, no renombra ni borra: 403 con el motivo")
    void elAdministradorDeUnBalneario_noTocaElCatalogo() throws Exception {
        syncWithDatabase();
        long antes = amenityRepository.count();

        for (MockHttpServletRequestBuilder pedido : List.of(crear(), renombrar(), borrar())) {
            mockMvc.perform(pedido.header("Authorization", bearer(adminDelBalneario)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error").value(MOTIVO));
        }

        syncWithDatabase();
        assertThat(amenityRepository.count()).isEqualTo(antes);
        assertThat(amenityRepository.findById(servicio.getIdAmenity()).orElseThrow().getName())
                .isEqualTo("Duchas de prueba");
    }

    @Test
    @DisplayName("el 403 del administrador de un balneario va antes que la validación del nombre")
    void elAdministradorDeUnBalneario_recibe403AunqueElNombreVengaVacio() throws Exception {
        syncWithDatabase();
        mockMvc.perform(json(post("/api/amenities"), """
                        {"name":""}""").header("Authorization", bearer(adminDelBalneario)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value(MOTIVO));
    }

    @Test
    @DisplayName("el administrador de un balneario sigue eligiendo sus servicios en Mi balneario")
    void elAdministradorDeUnBalneario_eligeSusServicios() throws Exception {
        balneario.setAdminEmail(adminDelBalneario.getEmail());
        resortRepository.save(balneario);
        syncWithDatabase();

        mockMvc.perform(json(put("/api/resorts/my"), """
                        {"name":"%s","location":"%s","amenityIds":[%d]}"""
                        .formatted(balneario.getName(), balneario.getLocation(), servicio.getIdAmenity()))
                        .header("Authorization", bearer(adminDelBalneario)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resort.amenities[0].idAmenity").value(servicio.getIdAmenity()));
    }

    // ---------------------------------------------------------------------
    // Clientes, sin sesión y la lectura pública
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("un cliente: 403; sin token: 401")
    void clienteYSinToken() throws Exception {
        syncWithDatabase();
        for (MockHttpServletRequestBuilder pedido : List.of(crear(), renombrar(), borrar())) {
            mockMvc.perform(pedido.header("Authorization", bearer(cliente)))
                    .andExpect(status().isForbidden());
        }
        for (MockHttpServletRequestBuilder pedido : List.of(crear(), renombrar(), borrar())) {
            mockMvc.perform(pedido).andExpect(status().isUnauthorized());
        }
    }

    @Test
    @DisplayName("ver el catálogo sigue siendo público")
    void elCatalogoEsPublico() throws Exception {
        syncWithDatabase();
        mockMvc.perform(get("/api/amenities"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.idAmenity == " + servicio.getIdAmenity() + ")]").exists());
    }
}
