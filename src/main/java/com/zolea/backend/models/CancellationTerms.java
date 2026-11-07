package com.zolea.backend.models;

import java.math.BigDecimal;

/**
 * Qué pasa si una reserva se cancela un día dado: si se puede y, en ese caso, qué porcentaje del
 * total se reintegra y cuánto es; si no se puede, por qué. Lo calcula {@link Booking#refundFor}.
 *
 * @param allowed       si se puede cancelar.
 * @param refundPercent el porcentaje del total que se reintegra; null si no se puede cancelar.
 * @param refundAmount  lo que se reintegra, con la escala de la plata; null si no se puede cancelar
 *                      o si la reserva no estaba pagada.
 * @param reason        por qué no se puede cancelar; null si se puede.
 */
public record CancellationTerms(boolean allowed, Integer refundPercent, BigDecimal refundAmount,
                                String reason) {

    /** Se cancela y se reintegra ese porcentaje del total. */
    static CancellationTerms refund(int percent, BigDecimal amount) {
        return new CancellationTerms(true, percent, amount, null);
    }

    /** Se cancela sin reintegro, porque no se pagó nada. */
    static CancellationTerms withoutPayment() {
        return new CancellationTerms(true, 0, null, null);
    }

    static CancellationTerms rejected(String reason) {
        return new CancellationTerms(false, null, null, reason);
    }
}
