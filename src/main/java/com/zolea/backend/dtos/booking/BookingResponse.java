package com.zolea.backend.dtos.booking;

import com.zolea.backend.dtos.guest.GuestSummaryResponse;
import com.zolea.backend.models.CanceledBy;
import com.zolea.backend.models.Status;
import com.zolea.backend.models.UnitType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record BookingResponse(
        Long id,
        LocalDate startDate,
        LocalDate endDate,
        BigDecimal totalPrice,
        Status status,
        LocalDateTime createdAt,
        Long idClient,
        Long rentalUnitId,
        // Cómo la ve la persona («A-01», sombrilla o carpa): sin esto, el detalle y Mis reservas
        // tenían que pedir el balneario entero para encontrar la unidad por su número interno.
        String rentalUnitIdentifier,
        UnitType rentalUnitType,
        List<GuestSummaryResponse> guests,
        String walkInName,
        String walkInDni,
        Long resortId,
        String resortName,
        String resortLocation,
        String resortCoverPhotoUrl,
        // La cancelación: cuándo, quién (CLIENT, ADMIN o SYSTEM) y cuánto se reintegró. Los tres
        // en null mientras no se cancela; el reintegro, también si no estaba pagada.
        LocalDateTime canceledAt,
        CanceledBy canceledBy,
        BigDecimal refundAmount,
        // Si el cliente ya la calificó: Mis reservas muestra «Calificar» solo si no.
        boolean reviewed,
        // Los cobros registrados, el más nuevo primero; la lista vacía si no hubo ninguno (RF40).
        List<PaymentSummaryResponse> payments
) {
}
