package com.zolea.backend.dtos.resort;

public record TodayStats(
        long activeBookings,
        long expectedGuests,
        long checkedIn
) {}
