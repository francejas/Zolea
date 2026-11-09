package com.zolea.backend.dtos.resort;

import com.zolea.backend.models.UnitType;

public record TopUnitStats(
        Long idRentalUnit,
        String identifier,
        UnitType type,
        long days
) {}
