package com.zolea.backend.dtos.resort;

import com.zolea.backend.models.UnitType;
import io.swagger.v3.oas.annotations.media.Schema;

/** Una de las unidades más reservadas del rango. */
public record TopUnitStats(
        @Schema(example = "10")
        Long idRentalUnit,
        @Schema(example = "B-02")
        String identifier,
        @Schema(example = "UMBRELLA")
        UnitType type,
        @Schema(description = "Días reservados dentro del rango", example = "14")
        long days
) {}
