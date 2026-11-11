package com.zolea.backend.dtos.resort;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

/** Lo que entró en un mes: la suma de las reservas confirmadas que empiezan ese mes. */
public record IncomeMonthStats(
        @Schema(description = "El mes, AAAA-MM", example = "2026-10")
        String month,
        @Schema(description = "Con dos decimales; 0 si ese mes no empezó ninguna reserva confirmada", example = "254000.00")
        BigDecimal income
) {}
