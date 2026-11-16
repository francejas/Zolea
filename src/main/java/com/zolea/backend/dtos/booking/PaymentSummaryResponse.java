package com.zolea.backend.dtos.booking;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Un cobro registrado de la reserva (RF40). Con esto el administrador ve qué se pagó y, si la reserva
 * está cancelada y tiene un pago aprobado —el pago que llegó tarde—, sabe que hay que reintegrarlo.
 */
public record PaymentSummaryResponse(
        @Schema(description = "El número del pago en MercadoPago", example = "1234567890")
        String gatewayPaymentId,
        @Schema(description = "Lo cobrado, con centavos", example = "25500.00")
        BigDecimal amount,
        @Schema(description = "El estado tal como lo informó la pasarela", example = "approved")
        String status,
        @Schema(description = "Cuándo lo aprobó la pasarela, en hora de Buenos Aires. Puede venir en null",
                example = "2026-01-10T10:15:00")
        LocalDateTime paidAt
) {
}
