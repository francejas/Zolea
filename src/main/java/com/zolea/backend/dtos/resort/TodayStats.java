package com.zolea.backend.dtos.resort;

import io.swagger.v3.oas.annotations.media.Schema;

/** El resumen de hoy del balneario. No depende del rango pedido. */
public record TodayStats(
        @Schema(description = "Reservas confirmadas que incluyen hoy", example = "3")
        long activeBookings,
        @Schema(description = "Todas las personas de esas reservas, titular incluido", example = "8")
        long expectedGuests,
        @Schema(description = "Cuántas de esas personas ya tienen la entrada validada", example = "2")
        long checkedIn,
        @Schema(description = "Reservas del balneario que siguen pendientes de pago", example = "2")
        long pendingBookings,
        @Schema(description = "Unidades que no están bloqueadas y no tienen una reserva confirmada que incluya hoy", example = "17")
        long freeUnits
) {}
