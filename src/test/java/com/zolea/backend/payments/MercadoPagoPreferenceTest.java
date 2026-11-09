package com.zolea.backend.payments;

import com.mercadopago.client.preference.PreferencePaymentTypeRequest;
import com.mercadopago.client.preference.PreferenceRequest;
import com.zolea.backend.config.TimeConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La preferencia que se le manda a MercadoPago, sin llamarlo: que el link venza con la reserva y que
 * no ofrezca pagar en efectivo, que acredita días después y dejaría la reserva pendiente de más.
 */
@DisplayName("MercadoPago — la preferencia del cobro")
class MercadoPagoPreferenceTest {

    private static final LocalDateTime EXPIRES_AT = LocalDateTime.of(2026, 1, 10, 11, 0);

    private final PreferenceRequest preference = new MercadoPagoGateway().preferenceFor(
            new CheckoutRequest(47L, "Reserva Zolea", new BigDecimal("30000.00"),
                    "https://ok", "https://pendiente", "https://error", "https://aviso", EXPIRES_AT));

    @Test
    @DisplayName("el link vence a la hora de la reserva, en la zona del balneario")
    void link_expiresWithTheBooking() {
        assertThat(preference.getExpires()).isTrue();
        assertThat(preference.getExpirationDateTo())
                .isEqualTo(EXPIRES_AT.atZone(TimeConfig.RESORT_ZONE).toOffsetDateTime());
    }

    @Test
    @DisplayName("no ofrece pagar en efectivo: excluye los cupones y los cajeros")
    void cash_isExcluded() {
        assertThat(preference.getPaymentMethods().getExcludedPaymentTypes())
                .extracting(PreferencePaymentTypeRequest::getId)
                .containsExactlyInAnyOrder("ticket", "atm");
    }
}
