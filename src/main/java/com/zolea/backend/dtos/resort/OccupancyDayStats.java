package com.zolea.backend.dtos.resort;

import java.time.LocalDate;

public record OccupancyDayStats(
        LocalDate date,
        long occupiedUnits,
        long totalUnits
) {}
