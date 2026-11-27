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
@Tag(name = "Reseñas", description = "El cliente califica el balneario donde estuvo y puede editar su reseña; las reseñas de cada balneario son públicas.")
public class ReviewController {

    private final ReviewService reviewService;

    // Solo un cliente, y dueño de la reserva: la reseña es del cliente, y un balneario no se
    // califica a sí mismo ni a la competencia. Un administrador recibe 403 aunque la reserva figure
    // a su nombre (una de mostrador cargada a su nombre, por ejemplo).
    @PreAuthorize("!hasRole('ADMIN') and @bookingAccess.canAccess(#id, principal.idClient)")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/api/bookings/{id}/review")
    @Operation(summary = "Calificar una reserva",
            description = "Una reseña por reserva, de 1 a 5 y con un comentario opcional de hasta 500 caracteres. "
                    + "Solo una reserva confirmada cuya estadía ya terminó, y solo su dueño.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "La reseña, como se va a ver en el balneario"),
            @ApiResponse(responseCode = "400", description = "La estadía todavía no terminó o la reserva no está confirmada, ya se calificó, o la calificación o el comentario no son válidos", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Quien pide es un administrador: la reseña es del cliente", content = @Content),
            @ApiResponse(responseCode = "404", description = "La reserva no existe, o es de otro cliente: la respuesta es la misma", content = @Content)
    })
    public ResponseEntity<ReviewResponse> reviewBooking(@PathVariable Long id,
                                                        @Valid @RequestBody ReviewRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(reviewService.review(id, request));
    }

    // Las mismas reglas que calificar: la reseña es del cliente dueño de la reserva.
    @PreAuthorize("!hasRole('ADMIN') and @bookingAccess.canAccess(#id, principal.idClient)")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/api/bookings/{id}/review")
    @Operation(summary = "Ver la reseña de una reserva",
            description = "La reseña que dejó el cliente sobre esa reserva, para editarla. Solo su dueño.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La reseña, como se ve en el balneario"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Quien pide es un administrador: la reseña es del cliente", content = @Content),
            @ApiResponse(responseCode = "404", description = "La reserva no existe o es de otro cliente, o todavía no se calificó", content = @Content)
    })
    public ResponseEntity<ReviewResponse> getBookingReview(@PathVariable Long id) {
        return ResponseEntity.ok(reviewService.getByBooking(id));
    }

    @PreAuthorize("!hasRole('ADMIN') and @bookingAccess.canAccess(#id, principal.idClient)")
    @SecurityRequirement(name = "bearerAuth")
    @PutMapping("/api/bookings/{id}/review")
    @Operation(summary = "Editar la reseña de una reserva",
            description = "Cambia las estrellas y el comentario de una reseña ya hecha. Conserva la fecha en que "
                    + "se calificó y registra cuándo se editó. Solo su dueño.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La reseña, como queda en el balneario"),
            @ApiResponse(responseCode = "400", description = "La calificación o el comentario no son válidos", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Quien pide es un administrador: la reseña es del cliente", content = @Content),
            @ApiResponse(responseCode = "404", description = "La reserva no existe o es de otro cliente, o todavía no se calificó", content = @Content)
    })
    public ResponseEntity<ReviewResponse> updateBookingReview(@PathVariable Long id,
                                                              @Valid @RequestBody ReviewRequest request) {
        return ResponseEntity.ok(reviewService.update(id, request));
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
