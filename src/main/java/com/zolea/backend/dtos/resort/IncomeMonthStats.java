package com.zolea.backend.dtos.resort;

import java.math.BigDecimal;

public record IncomeMonthStats(
        String month,
        BigDecimal income
) {}
