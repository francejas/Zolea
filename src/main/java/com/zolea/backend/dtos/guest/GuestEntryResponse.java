package com.zolea.backend.dtos.guest;

import com.zolea.backend.models.EntryMethod;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;

/** Un ingreso al balneario: quién entró, a qué unidad, cuándo y cómo se validó. */
public record GuestEntryResponse(
        Long id,
        Long idGuest,
        @Schema(example = "Santiago Rodríguez")
        String fullName,
        Long bookingId,
        @Schema(description = "La unidad de la reserva", example = "A-03")
        String rentalUnitIdentifier,
        @Schema(description = "Cuándo entró, en hora de Buenos Aires", example = "2026-01-10T10:12:00")
        LocalDateTime enteredAt,
        @Schema(description = "Cómo se validó: leyendo el QR, escribiendo el código o con el DNI", example = "QR")
        EntryMethod method
) {
}
