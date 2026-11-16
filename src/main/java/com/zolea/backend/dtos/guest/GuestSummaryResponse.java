package com.zolea.backend.dtos.guest;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/**
 * Una persona de la reserva.
 *
 * @param isEntryValidated si entró <b>hoy</b> (el día de Buenos Aires). Desde la 15.6 el código sirve
 *                         toda la estadía, así que «entró o no» dejó de tener sentido.
 * @param lastEntryAt      cuándo entró por última vez, en la hora del balneario; {@code null} si nunca entró.
 */
public record GuestSummaryResponse(
        Long idGuest,
        String fullName,
        String dni,
        @Schema(description = "Si entró hoy (el día de Buenos Aires)", example = "true")
        Boolean isEntryValidated,
        @Schema(description = "Cuándo entró por última vez, en hora de Buenos Aires; null si nunca entró",
                example = "2026-01-10T10:00:00", nullable = true)
        LocalDateTime lastEntryAt,
        String qrToken
) {
}
