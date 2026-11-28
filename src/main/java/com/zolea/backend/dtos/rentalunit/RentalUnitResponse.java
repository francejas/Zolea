package com.zolea.backend.dtos.rentalunit;
import com.zolea.backend.models.UnitType;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.LocalDate;
public record RentalUnitResponse(
        Long idRentalUnit,
        UnitType type,
        String identifier,
        BigDecimal dailyPrice,
        Boolean isBlocked,
        // Sin esto no se puede saber de qué balneario es una unidad, así que ningún consumidor
        // podía agrupar ni filtrar por balneario aunque quisiera.
        Long resortId,
        // Dada de baja (RF32): definitiva, a diferencia del bloqueo. Solo se ve en el listado del
        // administrador; la ficha pública ya no la trae.
        boolean retired,
        @Schema(description = "Reservas pendientes o confirmadas que todavía no terminaron. Solo para el "
                + "administrador del balneario; para un cliente y en la ficha pública, null", example = "2")
        Integer upcomingBookings,
        @Schema(description = "El primer día, desde hoy, en que la unidad está reservada: el inicio de la "
                + "próxima, u hoy si una ya empezó. Null si no tiene reservas por delante, y para un cliente",
                example = "2026-12-14")
        LocalDate nextBookingDate,
        @Schema(description = "Columna de la unidad en el plano, desde 0. Null si no está ubicada (GH-68)",
                example = "3", nullable = true)
        Integer posX,
        @Schema(description = "Fila de la unidad en el plano, desde 0, con el mar arriba. Null si no está ubicada",
                example = "1", nullable = true)
        Integer posY
) {
}
