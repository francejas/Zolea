package com.zolea.backend;

import com.zolea.backend.models.Client;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Los balnearios desde la cuenta de Zolea (#71): los ve todos, da de alta uno junto con su
 * administrador, y desactiva o reactiva cualquiera.
 */
@AutoConfigureMockMvc
@DisplayName("Balnearios de la cuenta de Zolea")
class ZoleaResortsTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private PasswordEncoder passwordEncoder;

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    /** El alta de un balneario con su administrador, con los datos que se le pasan. */
    private static MockHttpServletRequestBuilder alta(String nombre, String email, String telefono, String dni) {
        return post("/api/resorts").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"%s","location":"Av. Bunge 1200, Pinamar, Buenos Aires",
                 "admin":{"firstName":"Laura","lastName":"Gómez","email":"%s",
                          "phone":"%s","dni":"%s","password":"provisoria1"}}"""
                .formatted(nombre, email, telefono, dni));
    }

    private static MockHttpServletRequestBuilder alta(String nombre) {
        return alta(nombre, "laura.gomez@pinamar.com", "+54 2254 123456", "30111222");
    }

    // ---------------------------------------------------------------------
    // Listar
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("la cuenta de Zolea lista los balnearios activos e inactivos, con su administrador y sus unidades")
    void listaTodos() throws Exception {
        Client zolea = theZoleaAccount();
        Resort activo = aResort();
        Resort inactivo = aResort();
        inactivo.setActive(false);
        resortRepository.save(inactivo);
        Client admin = anAdminOf(activo);
        admin.setEmail(activo.getAdminEmail());
        clientRepository.save(admin);
        aUnitIn(activo, 8500);
        aUnitIn(activo, 8500);
        RentalUnit baja = aUnitIn(activo, 8500);
        baja.setRetired(true);
        rentalUnitRepository.save(baja);
        syncWithDatabase();

        mockMvc.perform(get("/api/resorts/all").header("Authorization", bearer(zolea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.idResort == %d)].active".formatted(activo.getIdResort())).value(true))
                .andExpect(jsonPath("$[?(@.idResort == %d)].unitCount".formatted(activo.getIdResort())).value(2))
                .andExpect(jsonPath("$[?(@.idResort == %d)].admin.email".formatted(activo.getIdResort()))
                        .value(activo.getAdminEmail()))
                .andExpect(jsonPath("$[?(@.idResort == %d)].active".formatted(inactivo.getIdResort())).value(false))
                .andExpect(jsonPath("$[?(@.idResort == %d)].admin".formatted(inactivo.getIdResort()))
                        .value(hasItem((Object) null)));
    }

    @Test
    @DisplayName("el administrador de un balneario y un cliente no listan: 403")
    void soloLaCuentaDeZoleaLista() throws Exception {
        Client admin = anAdminOf(aResort());
        Client cliente = aClient();
        syncWithDatabase();

        mockMvc.perform(get("/api/resorts/all").header("Authorization", bearer(admin)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/resorts/all").header("Authorization", bearer(cliente)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/resorts/all"))
                .andExpect(status().isUnauthorized());
    }

    // ---------------------------------------------------------------------
    // Alta con su administrador
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("da de alta un balneario con su administrador, que ingresa y ve su balneario")
    void altaConAdministrador() throws Exception {
        Client zolea = theZoleaAccount();
        syncWithDatabase();

        mockMvc.perform(alta("Balneario Pinamar Norte").header("Authorization", bearer(zolea)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.resort.name").value("Balneario Pinamar Norte"))
                .andExpect(jsonPath("$.resort.active").value(true));

        syncWithDatabase();
        Resort creado = resortRepository.findByName("Balneario Pinamar Norte").orElseThrow();
        Client admin = clientRepository.findByEmail("laura.gomez@pinamar.com").orElseThrow();
        assertThat(admin.getRole()).isEqualTo("ADMIN");
        assertThat(admin.getManagedResort().getIdResort()).isEqualTo(creado.getIdResort());
        assertThat(admin.getFirstName()).isEqualTo("Laura");
        assertThat(admin.getDni()).isEqualTo("30111222");
        assertThat(passwordEncoder.matches("provisoria1", admin.getPasswordHash())).isTrue();

        String login = mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"laura.gomez@pinamar.com","password":"provisoria1"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(login, "$.token");

        mockMvc.perform(get("/api/resorts/my").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Balneario Pinamar Norte"));
    }

    @Test
    @DisplayName("un email que ya es de otra cuenta: 409 con el campo, y no se crea nada")
    void emailRepetido() throws Exception {
        Client zolea = theZoleaAccount();
        Client otro = aClient();
        syncWithDatabase();
        long balnearios = resortRepository.count();

        mockMvc.perform(alta("Balneario Repetido", otro.getEmail(), "+54 2254 999999", "30999888")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.campos['admin.email']").value("Ya hay otra cuenta con ese email."));

        syncWithDatabase();
        assertThat(resortRepository.count()).isEqualTo(balnearios);
        assertThat(resortRepository.findByName("Balneario Repetido")).isEmpty();
    }

    @Test
    @DisplayName("un teléfono o un DNI que ya son de otra cuenta: 409 con su campo")
    void telefonoYDniRepetidos() throws Exception {
        Client zolea = theZoleaAccount();
        Client otro = aClient();
        syncWithDatabase();

        mockMvc.perform(alta("Balneario Tel", "tel@pinamar.com", otro.getPhone(), "30999777")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.campos['admin.phone']").value("Ya hay otra cuenta con ese teléfono."));
        mockMvc.perform(alta("Balneario Dni", "dni@pinamar.com", "+54 2254 777777", otro.getDni())
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.campos['admin.dni']").value("Ya hay otra cuenta con ese DNI."));
    }

    @Test
    @DisplayName("sin los datos del administrador: 400 con cada campo")
    void faltanDatos() throws Exception {
        Client zolea = theZoleaAccount();
        syncWithDatabase();

        mockMvc.perform(post("/api/resorts").contentType(MediaType.APPLICATION_JSON).content("""
                        {"name":"","location":"Pinamar",
                         "admin":{"firstName":"Laura","lastName":"","email":"no-es-un-email",
                                  "phone":"","dni":"30.111.222","password":""}}""")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos.name").exists())
                .andExpect(jsonPath("$.campos['admin.lastName']").exists())
                .andExpect(jsonPath("$.campos['admin.email']").exists())
                .andExpect(jsonPath("$.campos['admin.phone']").exists())
                .andExpect(jsonPath("$.campos['admin.dni']").exists())
                .andExpect(jsonPath("$.campos['admin.password']").exists());
    }

    @Test
    @DisplayName("el administrador de un balneario no da de alta otro: 403 antes de mirar los datos")
    void elAdministradorNoDaDeAlta() throws Exception {
        Client admin = anAdminOf(aResort());
        syncWithDatabase();

        mockMvc.perform(alta("Balneario Intruso").header("Authorization", bearer(admin)))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/resorts").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isForbidden());

        syncWithDatabase();
        assertThat(resortRepository.findByName("Balneario Intruso")).isEmpty();
        assertThat(clientRepository.findByEmail("laura.gomez@pinamar.com")).isEmpty();
    }

    // ---------------------------------------------------------------------
    // Desactivar y reactivar
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("la cuenta de Zolea desactiva cualquier balneario y sale de la Portada; reactivado, vuelve")
    void desactivaYReactiva() throws Exception {
        Client zolea = theZoleaAccount();
        Resort resort = aResort();
        anAdminOf(resort);
        syncWithDatabase();
        String nombre = resort.getName();

        mockMvc.perform(put("/api/resorts/" + resort.getIdResort() + "/inactive")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resort.active").value(false));
        mockMvc.perform(get("/api/resorts"))
                .andExpect(jsonPath("$[*].name", not(hasItem(nombre))));

        mockMvc.perform(put("/api/resorts/" + resort.getIdResort() + "/active")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resort.active").value(true));
        mockMvc.perform(get("/api/resorts"))
                .andExpect(jsonPath("$[*].name", hasItem(nombre)));
    }

    @Test
    @DisplayName("la cuenta de Zolea sobre un balneario que no existe: 404")
    void balnearioQueNoExiste() throws Exception {
        Client zolea = theZoleaAccount();
        syncWithDatabase();

        mockMvc.perform(put("/api/resorts/999999/inactive").header("Authorization", bearer(zolea)))
                .andExpect(status().isNotFound());
    }
}
