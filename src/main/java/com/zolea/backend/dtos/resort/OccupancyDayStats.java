package com.zolea.backend.dtos.resort;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDate;

/** La ocupación de un día del rango. */
public record OccupancyDayStats(
        @Schema(description = "El día", example = "2026-10-01")
        LocalDate date,
        @Schema(description = "Unidades distintas con una reserva confirmada ese día", example = "5")
        long occupiedUnits,
        @Schema(description = "Unidades del balneario que hoy no están bloqueadas", example = "22")
        long totalUnits
) {}
