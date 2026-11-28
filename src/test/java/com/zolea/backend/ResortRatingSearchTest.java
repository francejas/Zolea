package com.zolea.backend;

import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Review;
import com.zolea.backend.models.Status;
import com.zolea.backend.repositories.ReviewRepository;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Arrays;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * La Portada por puntaje (#73): el promedio mínimo, las estrellas exactas y el orden por promedio.
 * El promedio es el que muestra la tarjeta, con un decimal.
 */
@AutoConfigureMockMvc
@DisplayName("Búsqueda por puntaje y orden por promedio")
class ResortRatingSearchTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ReviewRepository reviewRepository;

    /** Un balneario activo con una unidad y una reseña por cada puntaje que se le pasa. */
    private Resort aResortRated(int... ratings) {
        Resort resort = aResort();
        var unit = aUnitIn(resort, 10_000.0);
        for (int rating : ratings) {
            Booking booking = aBooking(aClient(), unit, today().minusDays(10), today().minusDays(8),
                    Status.CONFIRMED, now().minusDays(20));
            Review review = new Review();
            review.setBooking(booking);
            review.setRating(rating);
            review.setComment("Muy lindo.");
            review.setCreatedAt(now().minusDays(5));
            reviewRepository.save(review);
        }
        return resort;
    }

    private ResultActions search(String query) throws Exception {
        syncWithDatabase();
        return mockMvc.perform(get("/api/resorts?" + query));
    }

    private static Integer[] ids(Resort... resorts) {
        return Arrays.stream(resorts).map(r -> r.getIdResort().intValue()).toArray(Integer[]::new);
    }

    @Test
    @DisplayName("minRating deja los que tienen ese promedio o más; los que no tienen reseñas, no")
    void minimo() throws Exception {
        Resort cinco = aResortRated(5, 5);
        Resort cuatroYMedio = aResortRated(4, 5);
        Resort tres = aResortRated(3);
        Resort sinResenas = aResortRated();

        search("minRating=4.5")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort").value(containsInAnyOrder(ids(cinco, cuatroYMedio))));
        search("minRating=1")
                .andExpect(jsonPath("$[*].idResort").value(containsInAnyOrder(ids(cinco, cuatroYMedio, tres))));
    }

    @Test
    @DisplayName("stars deja los de esas estrellas exactas: un promedio de 4 a 4,9 cuenta como 4")
    void estrellasExactas() throws Exception {
        Resort cuatro = aResortRated(4);
        Resort cuatroConNueve = aResortRated(5, 5, 5, 5, 5, 5, 5, 5, 4, 4);   // 4,8
        Resort cinco = aResortRated(5);
        Resort tresYMedio = aResortRated(3, 4);
        aResortRated();

        search("stars=4")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort").value(containsInAnyOrder(ids(cuatro, cuatroConNueve))));
        search("stars=5")
                .andExpect(jsonPath("$[*].idResort").value(containsInAnyOrder(ids(cinco))));
        search("stars=3")
                .andExpect(jsonPath("$[*].idResort").value(containsInAnyOrder(ids(tresYMedio))));
    }

    @Test
    @DisplayName("sort=rating ordena por promedio, de mayor a menor, y los que no tienen reseñas van al final")
    void ordenPorPromedio() throws Exception {
        Resort sinResenas = aResortRated();
        Resort tres = aResortRated(3);
        Resort cinco = aResortRated(5);
        Resort cuatro = aResortRated(4);

        search("sort=rating")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort").value(contains(ids(cinco, cuatro, tres, sinResenas))));
    }

    @Test
    @DisplayName("con el mismo promedio, primero el que tiene más reseñas")
    void empateEnElPromedio() throws Exception {
        Resort pocas = aResortRated(4);
        Resort muchas = aResortRated(4, 4, 4);

        search("sort=rating")
                .andExpect(jsonPath("$[*].idResort").value(contains(ids(muchas, pocas))));
    }

    @Test
    @DisplayName("se combinan con los filtros de siempre")
    void conLosDemasFiltros() throws Exception {
        Resort buena = aResortRated(5);
        buena.setName("Playa Buena del Sur");
        resortRepository.save(buena);
        Resort otra = aResortRated(5);

        search("q=buena&minRating=4&sort=rating")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].idResort").value(contains(ids(buena))));
        search("maxPrice=5000&minRating=4")
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("valores inválidos: 400 con el motivo")
    void invalidos() throws Exception {
        search("minRating=0").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("minRating")));
        search("minRating=5.5").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("minRating")));
        search("stars=6").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("stars")));
        search("stars=0").andExpect(status().isBadRequest());
        search("stars=4.5").andExpect(status().isBadRequest());
        search("sort=precio").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("sort")));
        search("minRating=mucho").andExpect(status().isBadRequest());
    }
}
