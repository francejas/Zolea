package com.zolea.backend.controllers;

import com.zolea.backend.dtos.review.ReviewRequest;
import com.zolea.backend.dtos.review.ReviewResponse;
import com.zolea.backend.services.ReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@Tag(name = "Reseñas", description = "El cliente califica el balneario donde estuvo; las reseñas de cada balneario son públicas.")
public class ReviewController {

    private final ReviewService reviewService;

    // Solo un cliente, y solo el dueño de la reserva, sin la excepción de ADMIN que tienen los demás
    // endpoints de la reserva: la reseña es del cliente, y el balneario no se califica a sí mismo.
    // El rol se mira aparte del dueño: un administrador con una reserva a su nombre tampoco califica.
    @PreAuthorize("hasRole('USER') and @bookingAccess.canAccess(#id, principal.idClient)")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/api/bookings/{id}/review")
    @Operation(summary = "Calificar una reserva",
            description = "Una reseña por reserva, de 1 a 5 y con un comentario opcional de hasta 500 caracteres. "
                    + "Solo una reserva confirmada cuya estadía ya terminó, y solo su dueño.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "La reseña, como se va a ver en el balneario"),
            @ApiResponse(responseCode = "400", description = "La estadía todavía no terminó o la reserva no está confirmada, ya se calificó, o la calificación o el comentario no son válidos", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "La reserva es de otro cliente, o quien califica es un administrador", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe una reserva con ese identificador", content = @Content)
    })
    public ResponseEntity<ReviewResponse> reviewBooking(@PathVariable Long id,
                                                        @Valid @RequestBody ReviewRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(reviewService.review(id, request));
    }

    @GetMapping("/api/resorts/{id}/reviews")
    @Operation(summary = "Reseñas de un balneario", description = "Público. De la más nueva a la más vieja.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Las reseñas del balneario; la lista vacía si todavía no tiene"),
            @ApiResponse(responseCode = "404", description = "No existe un balneario con ese identificador", content = @Content)
    })
    public ResponseEntity<List<ReviewResponse>> getResortReviews(@PathVariable Long id) {
        return ResponseEntity.ok(reviewService.getByResort(id));
    }
}
