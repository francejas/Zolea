package com.zolea.backend.payments;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Lo que la aplicación le pide a la pasarela para cobrar una reserva.
 *
 * @param bookingId  la reserva que se está cobrando; vuelve en el pago como referencia externa y
 *                   es lo que permite comprobar que un pago corresponde a esta reserva y no a otra
 * @param concept    lo que ve el cliente en la pantalla de pago
 * @param amount     importe exacto
 * @param successUrl adónde vuelve el cliente si el pago sale bien
 * @param pendingUrl adónde vuelve si queda pendiente
 * @param failureUrl adónde vuelve si falla
 * @param notificationUrl adónde avisa la pasarela por su cuenta, sin pasar por el navegador
 * @param expiresAt  hasta cuándo se puede pagar, en la hora del balneario: la creación de la
 *                   reserva más el plazo de pago. El link vence a la misma hora que la reserva
 */
public record CheckoutRequest(
        Long bookingId,
        String concept,
        BigDecimal amount,
        String successUrl,
        String pendingUrl,
        String failureUrl,
        String notificationUrl,
        LocalDateTime expiresAt
) {
}
