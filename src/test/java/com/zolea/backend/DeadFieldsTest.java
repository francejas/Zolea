package com.zolea.backend;

import com.zolea.backend.models.Amenity;
import com.zolea.backend.models.Resort;
import com.zolea.backend.repositories.AmenityRepository;
import com.zolea.backend.repositories.ResortRepository;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Campos y operaciones que el sistema tenía a medio terminar.
 *
 * <p>Los dos casos de acá son el mismo problema visto de dos lados: <b>algo que la base de datos
 * modela y la aplicación ignora</b>. Un balneario puede estar inactivo, y se listaba igual. Una
 * amenidad puede estar en uso, y borrarla explotaba con un error de integridad en vez de resolverse.
 *
 * <p>Un campo que nadie lee no es neutral: el administrador desactiva su balneario, ve que el
 * endpoint respondió que sí, y el balneario le sigue apareciendo a los clientes.
 */
@AutoConfigureMockMvc
@DisplayName("Campos que estaban a medio implementar")
class DeadFieldsTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ResortRepository resortRepository;
    @Autowired private AmenityRepository amenityRepository;
    @Autowired private JwtUtil jwtUtil;

    private String tokenFor(com.zolea.backend.models.Client client) {
        return jwtUtil.generateToken(UserPrincipal.de(client));
    }

    @Test
    @DisplayName("el listado público no muestra los balnearios desactivados")
    void thePublicListing_hidesInactiveResorts() throws Exception {
        Resort visible = aResort();
        Resort hidden = aResort();
        hidden.setActive(false);
        resortRepository.save(hidden);
        syncWithDatabase();

        mockMvc.perform(get("/api/resorts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.idResort == " + visible.getIdResort() + ")]").exists())
                .andExpect(jsonPath("$[?(@.idResort == " + hidden.getIdResort() + ")]").doesNotExist());
    }

    @Test
    @DisplayName("la respuesta de un balneario dice si está activo")
    void theResortResponse_saysWhetherItIsActive() throws Exception {
        Resort resort = aResort();
        syncWithDatabase();

        // Sin este dato, el panel del administrador no tiene cómo mostrar en qué estado está su
        // balneario: los endpoints de activar y desactivar existen, pero el estado no se podía leer.
        mockMvc.perform(get("/api/resorts/" + resort.getIdResort()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true));
    }

    @Test
    @DisplayName("borrar un servicio que un balneario ofrece lo desvincula, no falla")
    void deletingAnAmenityInUse_unlinksIt() throws Exception {
        Resort resort = aResort();
        Amenity amenity = amenityRepository.save(newAmenity("Sombrillas de paja"));
        resort.setAmenities(new ArrayList<>(List.of(amenity)));
        resortRepository.save(resort);
        syncWithDatabase();

        mockMvc.perform(delete("/api/amenities/" + amenity.getIdAmenity())
                        .header("Authorization", "Bearer " + tokenFor(theZoleaAccount())))
                .andExpect(status().isNoContent());

        syncWithDatabase();
        assertThat(amenityRepository.findById(amenity.getIdAmenity())).isEmpty();
        assertThat(resortRepository.findById(resort.getIdResort()).orElseThrow().getAmenities())
                .withFailMessage("el balneario quedó apuntando a un servicio borrado")
                .isEmpty();
    }

    private Amenity newAmenity(String name) {
        Amenity amenity = new Amenity();
        amenity.setName(name);
        return amenity;
    }
}
