package com.zolea.backend.dtos.resort;

import java.time.LocalDate;
import java.util.List;

public record ResortStatsResponse(
        LocalDate from,
        LocalDate to,
        TodayStats today,
        List<OccupancyDayStats> occupancyByDay,
        List<IncomeMonthStats> incomeByMonth,
        List<TopUnitStats> topUnits
) {}