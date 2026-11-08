package com.zolea.backend.dtos.booking;

import com.zolea.backend.models.CancellationTerms;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

/**
 * Lo que pasaría si la reserva se cancela hoy, sin cancelarla: lo que la pantalla muestra antes de
 * pedir la confirmación. {@code PATCH /api/bookings/{id}/cancel} aplica exactamente esto.
 */
public record CancellationResponse(
        @Schema(description = "Si hoy se puede cancelar", example = "true")
        boolean canCancel,
        @Schema(description = "Lo que se reintegraría. Null si no se puede cancelar o si la reserva no está pagada",
                example = "15000.00")
        BigDecimal refundAmount,
        @Schema(description = "El porcentaje del total que se reintegraría: 100, 50 o 0 si no está pagada",
                example = "50")
        Integer refundPercent,
        @Schema(description = "Por qué no se puede cancelar. Null si se puede",
                example = "Tu estadía ya empezó: no se puede cancelar.")
        String reason
) {
    public static CancellationResponse of(CancellationTerms terms) {
        return new CancellationResponse(
                terms.allowed(), terms.refundAmount(), terms.refundPercent(), terms.reason());
    }
}
