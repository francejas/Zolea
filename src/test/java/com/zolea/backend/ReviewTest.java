package com.zolea.backend;

import com.zolea.backend.config.TimeConfig;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Review;
import com.zolea.backend.models.Status;
import com.zolea.backend.repositories.ReviewRepository;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Reseñas, el primero de los requisitos del TFI: el cliente califica el balneario donde estuvo.
 *
 * <p>Una reseña por reserva, de 1 a 5 y con un comentario opcional. Solo se califica una reserva
 * confirmada cuya estadía ya terminó, y solo la califica su dueño. Las reseñas de un balneario son
 * públicas, y el balneario muestra su promedio y cuántas tiene.
 *
 * <p>El reloj queda fijo, así la prueba no cambia de resultado si cruza la medianoche.
 */
@AutoConfigureMockMvc
@Import(ReviewTest.FixedClock.class)
@DisplayName("Reseñas — el cliente califica el balneario donde estuvo")
class ReviewTest extends IntegrationTest {

    private static final String NOT_ENDED = "Vas a poder calificar cuando termine tu estadía.";

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private ReviewRepository reviewRepository;

    private String bearer(Client client) {
        return "Bearer " + jwtUtil.generateToken(UserPrincipal.de(client));
    }

    /** Una reserva de tres días que terminó hace {@code daysAgo} días (0: termina hoy). */
    private Booking stayEnded(int daysAgo, Client client, Resort resort, Status status) {
        Booking booking = aBooking(client, aUnitIn(resort, 10_000.0),
                today().minusDays(daysAgo + 2), today().minusDays(daysAgo), status, now().minusDays(30));
        syncWithDatabase();
        return booking;
    }

    private Booking endedYesterday(Client client) {
        return stayEnded(1, client, aResort(), Status.CONFIRMED);
    }

    private ResultActions review(Booking booking, Client client, String body) throws Exception {
        return mockMvc.perform(post("/api/bookings/" + booking.getId() + "/review")
                .header("Authorization", bearer(client))
                .contentType("application/json")
                .content(body));
    }

    /** Una reseña guardada directamente, para las pruebas que necesitan fechas distintas. */
    private Review aReview(Booking booking, int rating, String comment, LocalDateTime createdAt) {
        Review review = new Review();
        review.setBooking(booking);
        review.setRating(rating);
        review.setComment(comment);
        review.setCreatedAt(createdAt);
        return reviewRepository.save(review);
    }

    // ---------------------------------------------------------------------
    // Calificar
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("una reserva confirmada que ya terminó se califica: 201, y queda guardada")
    void confirmedAndEnded_created() throws Exception {
        Client client = aClient();
        Booking booking = endedYesterday(client);

        review(booking, client, """
                {"rating": 5, "comment": "Impecable, la carpa estaba lista al llegar."}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.rating").value(5))
                .andExpect(jsonPath("$.comment").value("Impecable, la carpa estaba lista al llegar."))
                .andExpect(jsonPath("$.author").value("Cliente N."))
                .andExpect(jsonPath("$.createdAt").value("2026-01-10T10:00:00"));

        syncWithDatabase();
        Review saved = reviewRepository.findAll().stream()
                .filter(r -> r.getBooking().getId().equals(booking.getId()))
                .findFirst().orElseThrow();
        assertThat(saved.getRating()).isEqualTo(5);
        assertThat(saved.getCreatedAt()).isEqualTo(now());
    }

    @Test
    @DisplayName("el comentario es opcional")
    void withoutComment_created() throws Exception {
        Client client = aClient();
        Booking booking = endedYesterday(client);

        review(booking, client, """
                {"rating": 4}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.rating").value(4))
                .andExpect(jsonPath("$.comment").value(nullValue()));
    }

    @Test
    @DisplayName("una estadía que termina hoy todavía no se califica: 400")
    void endsToday_rejected() throws Exception {
        Client client = aClient();
        Booking booking = stayEnded(0, client, aResort(), Status.CONFIRMED);

        review(booking, client, """
                {"rating": 5}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(NOT_ENDED));
    }

    @Test
    @DisplayName("una reserva cancelada no se califica, aunque sus fechas hayan pasado: 400")
    void canceled_rejected() throws Exception {
        Client client = aClient();
        Booking booking = stayEnded(5, client, aResort(), Status.CANCELED);

        review(booking, client, """
                {"rating": 5}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(NOT_ENDED));
    }

    @Test
    @DisplayName("calificar dos veces la misma reserva: 400, y queda una sola reseña")
    void twice_rejected() throws Exception {
        Client client = aClient();
        Booking booking = endedYesterday(client);

        review(booking, client, """
                {"rating": 5}""").andExpect(status().isCreated());
        review(booking, client, """
                {"rating": 1, "comment": "Cambié de opinión."}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Ya calificaste esta reserva."));

        syncWithDatabase();
        assertThat(reviewRepository.findAll())
                .filteredOn(r -> r.getBooking().getId().equals(booking.getId()))
                .singleElement()
                .extracting(Review::getRating).isEqualTo(5);
    }

    @Test
    @DisplayName("la calificación va de 1 a 5 y el comentario hasta 500 caracteres: 400 con campos")
    void invalidFields_rejectedWithFields() throws Exception {
        Client client = aClient();
        Booking booking = endedYesterday(client);

        review(booking, client, """
                {"rating": 6}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos.rating").exists());
        review(booking, client, """
                {"rating": 0}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos.rating").exists());
        review(booking, client, """
                {"comment": "Sin calificación."}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos.rating").exists());
        review(booking, client, """
                {"rating": 4, "comment": "%s"}""".formatted("a".repeat(501)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos.comment").exists());

        syncWithDatabase();
        assertThat(reviewRepository.findAll())
                .noneMatch(r -> r.getBooking().getId().equals(booking.getId()));
    }

    @Test
    @DisplayName("la reserva de otro cliente: 403")
    void anotherClientsBooking_forbidden() throws Exception {
        Booking booking = endedYesterday(aClient());

        review(booking, aClient(), """
                {"rating": 1}""")
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("el admin del balneario tampoco califica: la reseña es del cliente, 403")
    void adminOfTheResort_forbidden() throws Exception {
        Resort resort = aResort();
        Booking booking = stayEnded(1, aClient(), resort, Status.CONFIRMED);

        review(booking, anAdminOf(resort), """
                {"rating": 5}""")
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("sin token: 401")
    void withoutToken_unauthorized() throws Exception {
        Booking booking = endedYesterday(aClient());

        mockMvc.perform(post("/api/bookings/" + booking.getId() + "/review")
                        .contentType("application/json")
                        .content("""
                                {"rating": 5}"""))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("una reserva que no existe: 404")
    void missingBooking_notFound() throws Exception {
        mockMvc.perform(post("/api/bookings/999999/review")
                        .header("Authorization", bearer(aClient()))
                        .contentType("application/json")
                        .content("""
                                {"rating": 5}"""))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("una reserva que nunca se pagó no se califica: 400")
    void pending_rejected() throws Exception {
        Client client = aClient();
        Booking booking = stayEnded(5, client, aResort(), Status.PENDING);

        review(booking, client, """
                {"rating": 5}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(NOT_ENDED));
    }

    // ---------------------------------------------------------------------
    // Las reseñas de un balneario
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("las reseñas de un balneario son públicas, de la más nueva a la más vieja")
    void resortReviews_publicNewestFirst() throws Exception {
        Resort resort = aResort();
        Client santiago = aClient();
        santiago.setFirstName("Santiago");
        santiago.setLastName("Rodríguez");
        clientRepository.save(santiago);

        aReview(stayEnded(20, santiago, resort, Status.CONFIRMED), 3, "La más vieja.", now().minusDays(15));
        aReview(stayEnded(5, aClient(), resort, Status.CONFIRMED), 5, "La más nueva.", now().minusDays(2));
        aReview(stayEnded(10, aClient(), resort, Status.CONFIRMED), 4, null, now().minusDays(7));
        // La de otro balneario no aparece.
        aReview(stayEnded(3, aClient(), aResort(), Status.CONFIRMED), 1, "De otro balneario.", now());
        syncWithDatabase();

        mockMvc.perform(get("/api/resorts/" + resort.getIdResort() + "/reviews"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].comment").value("La más nueva."))
                .andExpect(jsonPath("$[1].rating").value(4))
                .andExpect(jsonPath("$[1].comment").value(nullValue()))
                .andExpect(jsonPath("$[2].comment").value("La más vieja."))
                .andExpect(jsonPath("$[2].author").value("Santiago R."))
                .andExpect(jsonPath("$[2].createdAt").exists());
    }

    @Test
    @DisplayName("un balneario sin reseñas devuelve la lista vacía")
    void resortWithoutReviews_emptyList() throws Exception {
        Resort resort = aResort();
        syncWithDatabase();

        mockMvc.perform(get("/api/resorts/" + resort.getIdResort() + "/reviews"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("las reseñas de un balneario que no existe: 404")
    void missingResortReviews_notFound() throws Exception {
        mockMvc.perform(get("/api/resorts/999999/reviews"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("el balneario dice su promedio, con un decimal, y cuántas reseñas tiene")
    void resort_averageAndCount() throws Exception {
        Resort resort = aResort();
        aReview(stayEnded(3, aClient(), resort, Status.CONFIRMED), 5, null, now().minusDays(1));
        aReview(stayEnded(4, aClient(), resort, Status.CONFIRMED), 4, null, now().minusDays(2));
        aReview(stayEnded(5, aClient(), resort, Status.CONFIRMED), 4, null, now().minusDays(3));
        Resort withoutReviews = aResort();
        syncWithDatabase();

        // (5 + 4 + 4) / 3 = 4,333…
        mockMvc.perform(get("/api/resorts/" + resort.getIdResort()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.averageRating").value(4.3))
                .andExpect(jsonPath("$.reviewCount").value(3));
        mockMvc.perform(get("/api/resorts/" + withoutReviews.getIdResort()))
                .andExpect(jsonPath("$.averageRating").value(nullValue()))
                .andExpect(jsonPath("$.reviewCount").value(0));

        // El listado público dice lo mismo que la ficha.
        mockMvc.perform(get("/api/resorts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.idResort == %d)].averageRating", resort.getIdResort())
                        .value(contains(4.3)))
                .andExpect(jsonPath("$[?(@.idResort == %d)].reviewCount", resort.getIdResort())
                        .value(contains(3)))
                .andExpect(jsonPath("$[?(@.idResort == %d)].reviewCount", withoutReviews.getIdResort())
                        .value(contains(0)));
    }

    // ---------------------------------------------------------------------
    // La reserva dice si ya se calificó
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("la reserva dice si ya se calificó, en el detalle y en Mis reservas")
    void booking_saysIfReviewed() throws Exception {
        Client client = aClient();
        Booking booking = endedYesterday(client);

        mockMvc.perform(get("/api/bookings/" + booking.getId())
                        .header("Authorization", bearer(client)))
                .andExpect(jsonPath("$.reviewed").value(false));

        review(booking, client, """
                {"rating": 5}""").andExpect(status().isCreated());
        syncWithDatabase();

        mockMvc.perform(get("/api/bookings/" + booking.getId())
                        .header("Authorization", bearer(client)))
                .andExpect(jsonPath("$.reviewed").value(true));
        mockMvc.perform(get("/api/bookings/client/" + client.getIdClient())
                        .header("Authorization", bearer(client)))
                .andExpect(jsonPath("$[0].reviewed").value(true));
    }

    /** El 10 de enero de 2026 a las 10 de la mañana, en la zona del balneario. */
    @TestConfiguration
    static class FixedClock {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(Instant.parse("2026-01-10T13:00:00Z"), TimeConfig.RESORT_ZONE);
        }
    }
}
