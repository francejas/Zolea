package com.zolea.backend;

import com.zolea.backend.models.Client;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Mi cuenta (9.3): el cliente corrige sus datos con {@code PUT /api/clients/{id}}.
 *
 * <p>Un email, teléfono o DNI que ya es de otra cuenta llega como 409 con el campo en
 * {@code campos}, para que la pantalla lo marque debajo de ese campo. Antes lo frenaba recién la
 * restricción única de la base, con un 409 que no decía cuál de los tres era.
 */
@AutoConfigureMockMvc
@DisplayName("Mi cuenta — un dato que ya es de otra cuenta se marca en su campo")
class ClientProfileUpdateTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private PasswordEncoder passwordEncoder;

    private Client me;
    private Client other;

    @BeforeEach
    void twoAccounts() {
        me = aClient();
        other = aClient();
        syncWithDatabase();
    }

    @Test
    @DisplayName("el email de otra cuenta: 409 con el campo email")
    void anotherAccountsEmail_isMarkedOnEmail() throws Exception {
        update(other.getEmail(), me.getPhone(), me.getDni(), null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.campos.email").value("Ya hay otra cuenta con ese email."));
    }

    @Test
    @DisplayName("el teléfono de otra cuenta: 409 con el campo phone")
    void anotherAccountsPhone_isMarkedOnPhone() throws Exception {
        update(me.getEmail(), other.getPhone(), me.getDni(), null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.campos.phone").value("Ya hay otra cuenta con ese teléfono."));
    }

    @Test
    @DisplayName("el DNI de otra cuenta: 409 con el campo dni")
    void anotherAccountsDni_isMarkedOnDni() throws Exception {
        update(me.getEmail(), me.getPhone(), other.getDni(), null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.campos.dni").value("Ya hay otra cuenta con ese DNI."));
    }

    @Test
    @DisplayName("los datos propios no chocan consigo mismos, y sin contraseña no se cambia")
    void ownData_andNoPassword_keepThePassword() throws Exception {
        String before = me.getPasswordHash();

        update(me.getEmail(), me.getPhone(), me.getDni(), "")
                .andExpect(status().isOk());

        syncWithDatabase();
        assertThat(clientRepository.findById(me.getIdClient()).orElseThrow().getPasswordHash())
                .isEqualTo(before);
    }

    @Test
    @DisplayName("con una contraseña nueva, se cambia")
    void newPassword_isSaved() throws Exception {
        update(me.getEmail(), me.getPhone(), me.getDni(), "otraClave123")
                .andExpect(status().isOk());

        syncWithDatabase();
        String hash = clientRepository.findById(me.getIdClient()).orElseThrow().getPasswordHash();
        assertThat(passwordEncoder.matches("otraClave123", hash)).isTrue();
    }

    private ResultActions update(String email, String phone, String dni, String password) throws Exception {
        String passwordJson = password == null ? "null" : "\"" + password + "\"";
        return mockMvc.perform(put("/api/clients/" + me.getIdClient())
                .header("Authorization", "Bearer " + jwtUtil.generateToken(UserPrincipal.de(me)))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"firstName":"Santiago","lastName":"Rodríguez","email":"%s",
                         "password":%s,"phone":"%s","dni":"%s"}
                        """.formatted(email, passwordJson, phone, dni)));
    }
}
