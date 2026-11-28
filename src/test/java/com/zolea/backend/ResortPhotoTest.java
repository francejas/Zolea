package com.zolea.backend;

import com.jayway.jsonpath.JsonPath;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Las fotos del balneario: el administrador las sube, las ordena y las borra desde Mi balneario, y
 * cualquiera las ve. La primera es la portada; sin fotos, la portada sigue siendo la dirección que
 * el balneario ya tenía.
 */
@AutoConfigureMockMvc
@DisplayName("Fotos del balneario")
class ResortPhotoTest extends IntegrationTest {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 1, 2, 3};
    private static final byte[] JPG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 4, 5, 6};
    private static final byte[] WEBP = {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P', 7, 8};
    private static final byte[] GIF = {'G', 'I', 'F', '8', '9', 'a', 0, 0};

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private Resort resort;
    private Client admin;

    @BeforeEach
    void aResortWithItsAdmin() {
        resort = aResort();
        resort.setCoverPhotoUrl("https://ejemplo.test/portada.jpg");
        resortRepository.save(resort);
        admin = anAdminOf(resort);
        syncWithDatabase();
    }

    // ---------------------------------------------------------------------
    // Subir
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("subir una foto válida: 201, y el balneario la trae como portada")
    void validPhoto_isSavedAndBecomesTheCover() throws Exception {
        mockMvc.perform(upload(admin, png("playa.png")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].idPhoto").isNumber())
                .andExpect(jsonPath("$[0].url", containsString("/api/resorts/" + resort.getIdResort() + "/photos/")));

        String body = mockMvc.perform(get("/api/resorts/" + resort.getIdResort()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.photos", hasSize(1)))
                .andReturn().getResponse().getContentAsString();
        String url = JsonPath.read(body, "$.photos[0].url");
        assertThat((String) JsonPath.read(body, "$.coverPhotoUrl")).isEqualTo(url);
    }

    @Test
    @DisplayName("se suben varias a la vez, jpg, png y webp, en el orden en que llegan")
    void severalPhotos_inOneRequest() throws Exception {
        mockMvc.perform(upload(admin, png("a.png"), jpg("b.jpg"), webp("c.webp")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$", hasSize(3)));

        List<Long> ids = photoIds();
        assertThat(ids).hasSize(3).isSorted();
    }

    @Test
    @DisplayName("un archivo que no es jpg, png ni webp: 400 que dice cuál y por qué, y no se guarda ninguna")
    void wrongType_returns400WithTheFileName() throws Exception {
        mockMvc.perform(upload(admin, png("buena.png"),
                        new MockMultipartFile("files", "animada.gif", "image/png", GIF)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", containsString("animada.gif")))
                .andExpect(jsonPath("$.error", containsString("jpg, png o webp")));

        assertThat(photoIds()).isEmpty();
    }

    @Test
    @DisplayName("una foto de más de 5 MB: 400 que dice cuál y por qué")
    void tooBig_returns400WithTheFileName() throws Exception {
        byte[] big = Arrays.copyOf(PNG, 5 * 1024 * 1024 + 1);

        mockMvc.perform(upload(admin, new MockMultipartFile("files", "enorme.png", "image/png", big)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", containsString("enorme.png")))
                .andExpect(jsonPath("$.error", containsString("5 MB")));

        assertThat(photoIds()).isEmpty();
    }

    @Test
    @DisplayName("una foto de 5 MB justos entra")
    void exactlyFiveMegabytes_isAccepted() throws Exception {
        byte[] limit = Arrays.copyOf(PNG, 5 * 1024 * 1024);

        mockMvc.perform(upload(admin, new MockMultipartFile("files", "justa.png", "image/png", limit)))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("la foto número 11: 400, el balneario tiene hasta 10")
    void eleventhPhoto_returns400() throws Exception {
        MockMultipartFile[] ten = new MockMultipartFile[10];
        for (int i = 0; i < 10; i++) {
            ten[i] = png("foto" + i + ".png");
        }
        mockMvc.perform(upload(admin, ten)).andExpect(status().isCreated());

        mockMvc.perform(upload(admin, png("once.png")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", containsString("10 fotos")));

        assertThat(photoIds()).hasSize(10);
    }

    @Test
    @DisplayName("sin archivos: 400")
    void noFiles_returns400() throws Exception {
        mockMvc.perform(withToken(multipart("/api/resorts/my/photos"), admin))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").isNotEmpty());
    }

    // ---------------------------------------------------------------------
    // Ordenar
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("el orden se guarda, y la primera del orden nuevo es la portada")
    void order_isSaved_andTheFirstIsTheCover() throws Exception {
        mockMvc.perform(upload(admin, png("a.png"), png("b.png"), png("c.png")))
                .andExpect(status().isCreated());
        List<Long> ids = photoIds();
        List<Long> reversed = List.of(ids.get(2), ids.get(0), ids.get(1));

        mockMvc.perform(json(put("/api/resorts/my/photos/order"), admin, """
                        {"photoIds":[%d,%d,%d]}""".formatted(reversed.get(0), reversed.get(1), reversed.get(2))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].idPhoto").value(reversed.get(0)));

        syncWithDatabase();
        assertThat(photoIds()).containsExactlyElementsOf(reversed);
        mockMvc.perform(get("/api/resorts/" + resort.getIdResort()))
                .andExpect(jsonPath("$.coverPhotoUrl", endsWith("/photos/" + reversed.get(0))));
    }

    @Test
    @DisplayName("un orden que no trae todas las fotos, o trae una ajena: 400 y no cambia nada")
    void incompleteOrder_returns400() throws Exception {
        mockMvc.perform(upload(admin, png("a.png"), png("b.png"))).andExpect(status().isCreated());
        List<Long> ids = photoIds();

        mockMvc.perform(json(put("/api/resorts/my/photos/order"), admin,
                        "{\"photoIds\":[" + ids.get(1) + "]}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(json(put("/api/resorts/my/photos/order"), admin,
                        "{\"photoIds\":[" + ids.get(1) + "," + ids.get(0) + ",999999]}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(json(put("/api/resorts/my/photos/order"), admin,
                        "{\"photoIds\":[" + ids.get(1) + "," + ids.get(1) + "]}"))
                .andExpect(status().isBadRequest());

        syncWithDatabase();
        assertThat(photoIds()).containsExactlyElementsOf(ids);
    }

    // ---------------------------------------------------------------------
    // Borrar
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("borrar una foto: 204, y deja de estar")
    void delete_removesThePhoto() throws Exception {
        mockMvc.perform(upload(admin, png("a.png"), png("b.png"))).andExpect(status().isCreated());
        List<Long> ids = photoIds();

        mockMvc.perform(withToken(delete("/api/resorts/my/photos/" + ids.get(0)), admin))
                .andExpect(status().isNoContent());

        syncWithDatabase();
        assertThat(photoIds()).containsExactly(ids.get(1));
        mockMvc.perform(get("/api/resorts/" + resort.getIdResort() + "/photos/" + ids.get(0)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("la foto de otro balneario no se borra: 404, igual que una que no existe")
    void deleteOthersPhoto_returns404LikeAMissingOne() throws Exception {
        mockMvc.perform(upload(admin, png("mia.png"))).andExpect(status().isCreated());
        Long mine = photoIds().get(0);
        Client otherAdmin = anAdminOf(aResort());
        syncWithDatabase();

        String ajena = mockMvc.perform(withToken(delete("/api/resorts/my/photos/" + mine), otherAdmin))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();
        String inexistente = mockMvc.perform(withToken(delete("/api/resorts/my/photos/999999"), otherAdmin))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();

        assertThat(ajena.replace(String.valueOf(mine), "ID")).isEqualTo(inexistente.replace("999999", "ID"));
        syncWithDatabase();
        assertThat(photoIds()).containsExactly(mine);
    }

    // ---------------------------------------------------------------------
    // Ver
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("ver una foto sin sesión funciona, con su tipo y encabezados de caché")
    void viewPhoto_isPublic_andCacheable() throws Exception {
        mockMvc.perform(upload(admin, jpg("playa.jpg"))).andExpect(status().isCreated());
        Long id = photoIds().get(0);

        mockMvc.perform(get("/api/resorts/" + resort.getIdResort() + "/photos/" + id))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_JPEG))
                .andExpect(content().bytes(JPG))
                .andExpect(header().string("Cache-Control", containsString("max-age")));
    }

    @Test
    @DisplayName("una foto pedida con el id de otro balneario: 404")
    void viewPhotoUnderAnotherResort_returns404() throws Exception {
        mockMvc.perform(upload(admin, png("a.png"))).andExpect(status().isCreated());
        Long id = photoIds().get(0);
        Resort other = aResort();
        syncWithDatabase();

        mockMvc.perform(get("/api/resorts/" + other.getIdResort() + "/photos/" + id))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("sin fotos, la portada sigue siendo la dirección que tenía y photos viene vacía")
    void withoutPhotos_coverIsTheOldUrl() throws Exception {
        mockMvc.perform(get("/api/resorts/" + resort.getIdResort()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.photos", hasSize(0)))
                .andExpect(jsonPath("$.coverPhotoUrl").value("https://ejemplo.test/portada.jpg"));
    }

    // ---------------------------------------------------------------------
    // Quién puede
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("un cliente que intenta subir recibe 403")
    void clientUploading_gets403() throws Exception {
        mockMvc.perform(upload(aClient(), png("a.png")))
                .andExpect(status().isForbidden());
        assertThat(photoIds()).isEmpty();
    }

    @Test
    @DisplayName("la cuenta de Zolea no tiene balneario: 403")
    void zoleaAccountUploading_gets403() throws Exception {
        mockMvc.perform(upload(theZoleaAccount(), png("a.png")))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("sin token: 401")
    void withoutToken_gets401() throws Exception {
        mockMvc.perform(multipart("/api/resorts/my/photos").file(png("a.png")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/resorts/my/photos/1"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/resorts/my/photos/order")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"photoIds\":[]}"))
                .andExpect(status().isUnauthorized());
    }

    // ---------------------------------------------------------------------
    // Ayudas
    // ---------------------------------------------------------------------

    /** Los ids de las fotos del balneario, en el orden en que las devuelve la ficha pública. */
    private List<Long> photoIds() throws Exception {
        String body = mockMvc.perform(get("/api/resorts/" + resort.getIdResort()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<Number> ids = JsonPath.read(body, "$.photos[*].idPhoto");
        return ids.stream().map(Number::longValue).toList();
    }

    private static MockMultipartFile png(String name) {
        return new MockMultipartFile("files", name, "image/png", PNG);
    }

    private static MockMultipartFile jpg(String name) {
        return new MockMultipartFile("files", name, "image/jpeg", JPG);
    }

    private static MockMultipartFile webp(String name) {
        return new MockMultipartFile("files", name, "image/webp", WEBP);
    }

    private RequestBuilder upload(Client who, MockMultipartFile... files) {
        MockMultipartHttpServletRequestBuilder request = multipart("/api/resorts/my/photos");
        for (MockMultipartFile file : files) {
            request.file(file);
        }
        return withToken(request, who);
    }

    private RequestBuilder json(MockHttpServletRequestBuilder request, Client who, String body) {
        return withToken(request.contentType(MediaType.APPLICATION_JSON).content(body), who);
    }

    private <B extends AbstractMockHttpServletRequestBuilder<B>> B withToken(B request, Client who) {
        return request.header("Authorization", "Bearer " + jwtUtil.generateToken(UserPrincipal.de(who)));
    }
}
