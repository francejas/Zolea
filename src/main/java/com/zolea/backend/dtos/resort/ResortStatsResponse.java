package com.zolea.backend.dtos.resort;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDate;
import java.util.List;

/**
 * Los números del Panel con gráficos (14.8). Los nombres de los campos son el contrato con esa
 * pantalla: no se cambian sin avisar.
 */
public record ResortStatsResponse(
        @Schema(description = "Primer día del rango", example = "2026-10-01")
        LocalDate from,
        @Schema(description = "Último día del rango, incluido", example = "2026-12-31")
        LocalDate to,
        TodayStats today,
        @Schema(description = "Un elemento por día del rango, con los dos extremos y los días en 0")
        List<OccupancyDayStats> occupancyByDay,
        @Schema(description = "Un elemento por mes que toca el rango, en orden y con los meses en 0")
        List<IncomeMonthStats> incomeByMonth,
        @Schema(description = "Las 5 unidades con más días reservados en el rango; las de 0 días no van")
        List<TopUnitStats> topUnits
) {}
