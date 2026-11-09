package com.zolea.backend.dtos.review;

import com.zolea.backend.models.Client;
import com.zolea.backend.models.Review;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;

/**
 * Una reseña, como la ve cualquiera. Es pública, así que del autor sale solo el nombre y la
 * inicial del apellido: ni el email ni el apellido completo.
 */
public record ReviewResponse(
        @Schema(description = "Nombre e inicial del apellido de quien calificó", example = "Santiago R.")
        String author,
        @Schema(description = "De 1 a 5", example = "5")
        int rating,
        @Schema(description = "Null si no dejó comentario",
                example = "La carpa estaba lista al llegar y la atención fue excelente.")
        String comment,
        @Schema(description = "Cuándo se calificó", example = "2026-01-12T18:30:00")
        LocalDateTime createdAt
) {
    public static ReviewResponse of(Review review) {
        return new ReviewResponse(authorOf(review.getBooking().getClient()), review.getRating(),
                review.getComment(), review.getCreatedAt());
    }

    /** «Santiago R.»: el nombre y la inicial del apellido. */
    private static String authorOf(Client client) {
        if (client == null) {
            return null;
        }
        String lastName = client.getLastName();
        if (lastName == null || lastName.isBlank()) {
            return client.getFirstName();
        }
        return client.getFirstName() + " " + lastName.strip().charAt(0) + ".";
    }
}
