package com.zolea.backend;

import com.zolea.backend.models.Client;
import com.zolea.backend.models.Resort;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Mi balneario (12.5): el formulario manda siempre todos los datos, así que lo que llega vacío es
 * lo que el administrador dejó vacío.
 *
 * <p>Hasta acá el servicio salteaba lo vacío en los dos {@code PUT}, y la pantalla decía «Guardamos
 * los cambios» mientras la descripción o la foto borradas volvían. {@code PUT /api/resorts/{id}}
 * sigue conservándolo: es un pedido parcial (ver {@code InputValidationTest}).
 */
@AutoConfigureMockMvc
@DisplayName("Mi balneario — la descripción y la foto se pueden borrar")
class MyResortUpdateTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private Resort resort;
    private Client admin;

    @BeforeEach
    void aResortWithPhotoAndDescription() {
        resort = aResort();
        resort.setCoverPhotoUrl("https://ejemplo.test/portada.jpg");
        resort.setDescription("Carpas y sombrillas frente al mar.");
        admin = anAdminOf(resort);
        resort.setAdminEmail(admin.getEmail());
        resortRepository.save(resort);
        syncWithDatabase();
    }

    @Test
    @DisplayName("vacías, la descripción y la foto se borran: quedan en null")
    void emptyDescriptionAndPhoto_areCleared() throws Exception {
        mockMvc.perform(json(put("/api/resorts/my"), """
                        {"name":"%s","location":"%s","description":"","coverPhotoUrl":"  ","amenityIds":[]}"""
                        .formatted(resort.getName(), resort.getLocation())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resort.description").isEmpty())
                .andExpect(jsonPath("$.resort.coverPhotoUrl").isEmpty());

        syncWithDatabase();
        Resort saved = resortRepository.findById(resort.getIdResort()).orElseThrow();
        assertThat(saved.getDescription()).isNull();
        assertThat(saved.getCoverPhotoUrl()).isNull();
    }

    @Test
    @DisplayName("con texto, se reemplazan como siempre")
    void newDescriptionAndPhoto_replaceTheOldOnes() throws Exception {
        mockMvc.perform(json(put("/api/resorts/my"), """
                        {"name":"%s","location":"%s","description":"Parador nuevo.","coverPhotoUrl":"https://ejemplo.test/nueva.jpg","amenityIds":[]}"""
                        .formatted(resort.getName(), resort.getLocation())))
                .andExpect(status().isOk());

        syncWithDatabase();
        Resort saved = resortRepository.findById(resort.getIdResort()).orElseThrow();
        assertThat(saved.getDescription()).isEqualTo("Parador nuevo.");
        assertThat(saved.getCoverPhotoUrl()).isEqualTo("https://ejemplo.test/nueva.jpg");
    }

    @Test
    @DisplayName("el PUT con el id sigue conservando lo que llega vacío")
    void putById_stillKeepsEmptyFields() throws Exception {
        mockMvc.perform(json(put("/api/resorts/" + resort.getIdResort()), """
                        {"name":"%s","location":"%s","description":"","coverPhotoUrl":""}"""
                        .formatted(resort.getName(), resort.getLocation())))
                .andExpect(status().isOk());

        syncWithDatabase();
        Resort saved = resortRepository.findById(resort.getIdResort()).orElseThrow();
        assertThat(saved.getDescription()).isEqualTo("Carpas y sombrillas frente al mar.");
        assertThat(saved.getCoverPhotoUrl()).isEqualTo("https://ejemplo.test/portada.jpg");
    }

    private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
        return request.contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .header("Authorization", "Bearer " + jwtUtil.generateToken(UserPrincipal.de(admin)));
    }
}
