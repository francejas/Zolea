package com.zolea.backend.dtos.review;

import com.zolea.backend.models.Review;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * La calificación de una reserva. Acá se valida la forma; que la estadía haya terminado y que no se
 * haya calificado antes son reglas del negocio, y viven en {@code Booking} y en
 * {@code ReviewService}.
 */
public record ReviewRequest(
        @Schema(description = "De 1 a 5", example = "5")
        @NotNull(message = "La calificación es obligatoria")
        @Min(value = 1, message = "La calificación va de 1 a 5")
        @Max(value = 5, message = "La calificación va de 1 a 5")
        Integer rating,

        @Schema(description = "Opcional, hasta 500 caracteres",
                example = "La carpa estaba lista al llegar y la atención fue excelente.")
        @Size(max = Review.MAX_COMMENT, message = "El comentario puede tener hasta 500 caracteres")
        String comment
) {
}
