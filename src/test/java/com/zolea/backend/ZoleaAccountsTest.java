package com.zolea.backend;

import com.zolea.backend.models.Client;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Los usuarios desde la cuenta de Zolea (#72): ve todas las cuentas, las desactiva y reactiva, les
 * pone una contraseña provisoria y les asigna o les quita el balneario que administran.
 */
@AutoConfigureMockMvc
@DisplayName("Usuarios de la cuenta de Zolea")
class ZoleaAccountsTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private PasswordEncoder passwordEncoder;

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    /** Un cliente que puede ingresar con la contraseña que se le pasa. */
    private Client aClientWithPassword(String password) {
        Client client = aClient();
        client.setPasswordHash(passwordEncoder.encode(password));
        return clientRepository.save(client);
    }

    private MockHttpServletRequestBuilder login(String email, String password) {
        return post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"%s"}""".formatted(email, password));
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
        return request.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    // ---------------------------------------------------------------------
    // Desactivar y reactivar
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("una cuenta desactivada no ingresa: Ingresar dice que está desactivada")
    void desactivadaNoIngresa() throws Exception {
        Client zolea = theZoleaAccount();
        Client nati = aClientWithPassword("clave1234");
        syncWithDatabase();

        mockMvc.perform(patch("/api/accounts/" + nati.getIdClient() + "/inactive")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));

        syncWithDatabase();
        assertThat(clientRepository.findById(nati.getIdClient()).orElseThrow().isActive()).isFalse();

        mockMvc.perform(login(nati.getEmail(), "clave1234"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Tu cuenta está desactivada. Escribinos para reactivarla."));
    }

    @Test
    @DisplayName("con la contraseña equivocada, una cuenta desactivada recibe el mensaje de siempre")
    void desactivadaConClaveEquivocada() throws Exception {
        Client nati = aClientWithPassword("clave1234");
        nati.setActive(false);
        clientRepository.save(nati);
        syncWithDatabase();

        mockMvc.perform(login(nati.getEmail(), "otra-clave"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Email o contraseña incorrectos."));
    }

    @Test
    @DisplayName("el token de una cuenta desactivada deja de valer en el pedido siguiente: 401")
    void elTokenDejaDeValer() throws Exception {
        Client zolea = theZoleaAccount();
        Client nati = aClientWithPassword("clave1234");
        syncWithDatabase();
        String token = bearer(nati);

        mockMvc.perform(get("/api/auth/me").header("Authorization", token))
                .andExpect(status().isOk());

        mockMvc.perform(patch("/api/accounts/" + nati.getIdClient() + "/inactive")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isOk());
        syncWithDatabase();

        mockMvc.perform(get("/api/auth/me").header("Authorization", token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("reactivada, vuelve a ingresar")
    void reactivadaVuelveAIngresar() throws Exception {
        Client zolea = theZoleaAccount();
        Client nati = aClientWithPassword("clave1234");
        nati.setActive(false);
        clientRepository.save(nati);
        syncWithDatabase();

        mockMvc.perform(patch("/api/accounts/" + nati.getIdClient() + "/active")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true));
        syncWithDatabase();

        mockMvc.perform(login(nati.getEmail(), "clave1234"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("la cuenta de Zolea no se desactiva a sí misma: 400, y sigue activa")
    void noSeDesactivaASiMisma() throws Exception {
        Client zolea = theZoleaAccount();
        syncWithDatabase();

        mockMvc.perform(patch("/api/accounts/" + zolea.getIdClient() + "/inactive")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("No podés desactivar tu propia cuenta."));

        syncWithDatabase();
        assertThat(clientRepository.findById(zolea.getIdClient()).orElseThrow().isActive()).isTrue();
    }

    // ---------------------------------------------------------------------
    // Contraseña provisoria
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("la contraseña provisoria sirve para entrar, y la anterior ya no")
    void contrasenaProvisoria() throws Exception {
        Client zolea = theZoleaAccount();
        Client nati = aClientWithPassword("clave1234");
        syncWithDatabase();

        mockMvc.perform(json(put("/api/accounts/" + nati.getIdClient() + "/password"), """
                        {"password":"provisoria9"}""").header("Authorization", bearer(zolea)))
                .andExpect(status().isNoContent());
        syncWithDatabase();

        mockMvc.perform(login(nati.getEmail(), "provisoria9")).andExpect(status().isOk());
        mockMvc.perform(login(nati.getEmail(), "clave1234")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("una contraseña provisoria vacía: 400 con el campo")
    void contrasenaVacia() throws Exception {
        Client zolea = theZoleaAccount();
        Client nati = aClientWithPassword("clave1234");
        syncWithDatabase();

        mockMvc.perform(json(put("/api/accounts/" + nati.getIdClient() + "/password"), """
                        {"password":"  "}""").header("Authorization", bearer(zolea)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos.password").value("Escribí una contraseña provisoria."));
    }

    // ---------------------------------------------------------------------
    // Asignar y quitar el balneario
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("asignarle un balneario la hace administradora: lo ve en /api/resorts/my")
    void asignarBalneario() throws Exception {
        Client zolea = theZoleaAccount();
        Client nati = aClientWithPassword("clave1234");
        Resort resort = aResort();
        syncWithDatabase();

        mockMvc.perform(json(put("/api/accounts/" + nati.getIdClient() + "/managed-resort"), """
                        {"idResort":%d}""".formatted(resort.getIdResort()))
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("RESORT_ADMIN"))
                .andExpect(jsonPath("$.managedResort.idResort").value(resort.getIdResort()))
                .andExpect(jsonPath("$.managedResort.name").value(resort.getName()));
        syncWithDatabase();

        Client saved = clientRepository.findById(nati.getIdClient()).orElseThrow();
        assertThat(saved.getRole()).isEqualTo("ADMIN");
        assertThat(saved.getManagedResort().getIdResort()).isEqualTo(resort.getIdResort());

        mockMvc.perform(get("/api/resorts/my").header("Authorization", bearer(saved)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.idResort").value(resort.getIdResort()));
    }

    @Test
    @DisplayName("el administrador que ya estaba sigue viendo su balneario cuando se suma otro")
    void dosAdministradoresDelMismoBalneario() throws Exception {
        Client zolea = theZoleaAccount();
        Resort resort = aResort();
        Client primero = anAdminOf(resort);
        resort.setAdminEmail(primero.getEmail());
        resortRepository.save(resort);
        Client segundo = aClient();
        syncWithDatabase();

        mockMvc.perform(json(put("/api/accounts/" + segundo.getIdClient() + "/managed-resort"), """
                        {"idResort":%d}""".formatted(resort.getIdResort()))
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isOk());
        syncWithDatabase();

        mockMvc.perform(get("/api/resorts/my").header("Authorization", bearer(primero)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.idResort").value(resort.getIdResort()));
        assertThat(resortRepository.findById(resort.getIdResort()).orElseThrow().getAdminEmail())
                .isEqualTo(primero.getEmail());
    }

    @Test
    @DisplayName("quitarle el balneario la vuelve cliente: ya no entra al panel")
    void quitarBalneario() throws Exception {
        Client zolea = theZoleaAccount();
        Client admin = anAdminOf(aResort());
        syncWithDatabase();

        mockMvc.perform(delete("/api/accounts/" + admin.getIdClient() + "/managed-resort")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("CLIENT"))
                .andExpect(jsonPath("$.managedResort").isEmpty());
        syncWithDatabase();

        Client saved = clientRepository.findById(admin.getIdClient()).orElseThrow();
        assertThat(saved.getRole()).isEqualTo("USER");
        assertThat(saved.getManagedResort()).isNull();

        mockMvc.perform(get("/api/resorts/my").header("Authorization", bearer(saved)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("la cuenta de Zolea no se asigna un balneario a sí misma: 400, y sigue siendo la de Zolea")
    void noSeQuitaSuRol() throws Exception {
        Client zolea = theZoleaAccount();
        Resort resort = aResort();
        syncWithDatabase();

        mockMvc.perform(json(put("/api/accounts/" + zolea.getIdClient() + "/managed-resort"), """
                        {"idResort":%d}""".formatted(resort.getIdResort()))
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("No podés cambiar el rol de tu propia cuenta."));

        syncWithDatabase();
        assertThat(clientRepository.findById(zolea.getIdClient()).orElseThrow().getManagedResort()).isNull();
    }

    @Test
    @DisplayName("quitarle el balneario a una cuenta que no administra ninguno: 400")
    void quitarSinBalneario() throws Exception {
        Client zolea = theZoleaAccount();
        Client cliente = aClient();
        syncWithDatabase();

        mockMvc.perform(delete("/api/accounts/" + cliente.getIdClient() + "/managed-resort")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Esta cuenta no administra ningún balneario."));
    }

    @Test
    @DisplayName("un balneario que no existe: 404")
    void balnearioQueNoExiste() throws Exception {
        Client zolea = theZoleaAccount();
        Client cliente = aClient();
        syncWithDatabase();

        mockMvc.perform(json(put("/api/accounts/" + cliente.getIdClient() + "/managed-resort"), """
                        {"idResort":999999}""").header("Authorization", bearer(zolea)))
                .andExpect(status().isNotFound());
    }

    // ---------------------------------------------------------------------
    // Listar y ver
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("lista las cuentas con búsqueda por nombre, email o DNI")
    void listaConBusqueda() throws Exception {
        Client zolea = theZoleaAccount();
        Client nati = aClient();
        nati.setFirstName("Natalia");
        nati.setLastName("Zarategui");
        clientRepository.save(nati);
        Client otro = aClient();
        syncWithDatabase();

        mockMvc.perform(get("/api/accounts").param("q", "zarate").header("Authorization", bearer(zolea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].idClient").value(nati.getIdClient()))
                .andExpect(jsonPath("$.content[0].type").value("CLIENT"))
                .andExpect(jsonPath("$.content[0].active").value(true));

        mockMvc.perform(get("/api/accounts").param("q", otro.getEmail()).header("Authorization", bearer(zolea)))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].idClient").value(otro.getIdClient()));

        mockMvc.perform(get("/api/accounts").param("q", otro.getDni()).header("Authorization", bearer(zolea)))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].idClient").value(otro.getIdClient()));
    }

    @Test
    @DisplayName("filtra por tipo y pagina")
    void filtraYPagina() throws Exception {
        Client zolea = theZoleaAccount();
        Resort resort = aResort();
        Client admin = anAdminOf(resort);
        for (int i = 0; i < 3; i++) aClient();
        syncWithDatabase();
        long clientes = clientRepository.findAll().stream()
                .filter(c -> "USER".equals(c.getRole())).count();

        String body = mockMvc.perform(get("/api/accounts").param("type", "RESORT_ADMIN")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].managedResort.name").exists())
                .andReturn().getResponse().getContentAsString();
        List<String> tipos = com.jayway.jsonpath.JsonPath.read(body, "$.content[*].type");
        assertThat(tipos).isNotEmpty().allMatch("RESORT_ADMIN"::equals);
        List<Integer> ids = com.jayway.jsonpath.JsonPath.read(body, "$.content[*].idClient");
        assertThat(ids).contains(admin.getIdClient().intValue());

        mockMvc.perform(get("/api/accounts").param("type", "CLIENT").param("size", "2").param("page", "1")
                        .header("Authorization", bearer(zolea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.totalElements").value(clientes))
                .andExpect(jsonPath("$.totalPages").value((clientes + 1) / 2))
                .andExpect(jsonPath("$.content.length()").value((int) Math.min(2, clientes - 2)));
    }

    @Test
    @DisplayName("el detalle trae sus datos, el balneario que administra, sus reservas y si está activa")
    void detalle() throws Exception {
        Client zolea = theZoleaAccount();
        Resort resort = aResort();
        Client admin = anAdminOf(resort);
        var unit = aUnitIn(resort, 8500);
        aBooking(admin, unit, today().plusDays(1), today().plusDays(3), Status.CONFIRMED, now());
        aBooking(admin, unit, today().plusDays(5), today().plusDays(6), Status.CANCELED, now());
        syncWithDatabase();

        mockMvc.perform(get("/api/accounts/" + admin.getIdClient()).header("Authorization", bearer(zolea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(admin.getEmail()))
                .andExpect(jsonPath("$.dni").value(admin.getDni()))
                .andExpect(jsonPath("$.phone").value(admin.getPhone()))
                .andExpect(jsonPath("$.type").value("RESORT_ADMIN"))
                .andExpect(jsonPath("$.managedResort.idResort").value(resort.getIdResort()))
                .andExpect(jsonPath("$.bookingCount").value(2))
                .andExpect(jsonPath("$.active").value(true));

        mockMvc.perform(get("/api/accounts/" + zolea.getIdClient()).header("Authorization", bearer(zolea)))
                .andExpect(jsonPath("$.type").value("ZOLEA"));
    }

    @Test
    @DisplayName("una cuenta que no existe: 404")
    void cuentaQueNoExiste() throws Exception {
        Client zolea = theZoleaAccount();
        syncWithDatabase();

        mockMvc.perform(get("/api/accounts/999999").header("Authorization", bearer(zolea)))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch("/api/accounts/999999/inactive").header("Authorization", bearer(zolea)))
                .andExpect(status().isNotFound());
    }

    // ---------------------------------------------------------------------
    // Solo la cuenta de Zolea
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el administrador de un balneario y un cliente reciben 403 en todo esto; sin token, 401")
    void soloLaCuentaDeZolea() throws Exception {
        Resort resort = aResort();
        Client admin = anAdminOf(resort);
        Client cliente = aClient();
        Client otra = aClient();
        syncWithDatabase();
        long id = otra.getIdClient();

        for (Client quien : List.of(admin, cliente)) {
            for (MockHttpServletRequestBuilder pedido : pedidosSobre(id, resort.getIdResort())) {
                mockMvc.perform(pedido.header("Authorization", bearer(quien)))
                        .andExpect(status().isForbidden());
            }
        }
        mockMvc.perform(get("/api/accounts")).andExpect(status().isUnauthorized());

        syncWithDatabase();
        Client sinTocar = clientRepository.findById(id).orElseThrow();
        assertThat(sinTocar.isActive()).isTrue();
        assertThat(sinTocar.getManagedResort()).isNull();
    }

    /** Todos los pedidos de la cuenta de Zolea sobre una cuenta, armados de nuevo cada vez. */
    private static List<MockHttpServletRequestBuilder> pedidosSobre(long id, long idResort) {
        return List.of(
                get("/api/accounts"),
                get("/api/accounts/" + id),
                patch("/api/accounts/" + id + "/inactive"),
                patch("/api/accounts/" + id + "/active"),
                json(put("/api/accounts/" + id + "/password"), """
                        {"password":"provisoria9"}"""),
                json(put("/api/accounts/" + id + "/managed-resort"), """
                        {"idResort":%d}""".formatted(idResort)),
                delete("/api/accounts/" + id + "/managed-resort"));
    }
}
