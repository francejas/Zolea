package com.zolea.backend.payments;

import com.zolea.backend.config.TimeConfig;
import com.zolea.backend.exceptions.payment.PaymentGatewayException;
import com.mercadopago.client.payment.PaymentClient;
import com.mercadopago.client.preference.PreferenceBackUrlsRequest;
import com.mercadopago.client.preference.PreferenceClient;
import com.mercadopago.client.preference.PreferenceItemRequest;
import com.mercadopago.client.preference.PreferencePaymentMethodsRequest;
import com.mercadopago.client.preference.PreferencePaymentTypeRequest;
import com.mercadopago.client.preference.PreferenceRequest;
import com.mercadopago.core.MPRequestOptions;
import com.mercadopago.exceptions.MPApiException;
import com.mercadopago.resources.payment.Payment;
import com.mercadopago.resources.preference.Preference;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * La implementación de {@link PaymentGateway} contra MercadoPago.
 *
 * <p>Es el único archivo del proyecto que sabe que la pasarela es MercadoPago. Todo lo demás
 * depende del puerto, así que cambiar de proveedor —o probar sin ninguno— es cambiar esta clase.
 */
@Slf4j
@Service
public class MercadoPagoGateway implements PaymentGateway {

    // Vacío significa "no hay pasarela configurada": el cobro va a fallar, pero el resto del
    // sistema levanta y se puede probar.
    // PENDIENTE — pasa a @ConfigurationProperties validado junto con las URLs de retorno.
    @Value("${MP_ACCESS_TOKEN:}")
    private String accessToken;

    @Override
    public String createCheckout(CheckoutRequest request) {
        PreferenceRequest preference = preferenceFor(request);

        try {
            Preference creada = new PreferenceClient().create(preference, requestOptions());
            return creada.getInitPoint();
        } catch (MPApiException apiException) {
            // El cuerpo de la respuesta es lo único que dice POR QUÉ MercadoPago rechazó la
            // preferencia (monto inválido, token vencido, back_url no https). Va al log, no a la
            // respuesta: es detalle interno.
            log.error("MercadoPago rechazó la preferencia de la reserva {}. Respuesta: {}",
                    request.bookingId(), apiException.getApiResponse().getContent(), apiException);
            throw new PaymentGatewayException(
                    "No se pudo generar el pago. Intentalo de nuevo en unos minutos.", apiException);
        } catch (Exception e) {
            log.error("Falló la creación del cobro de la reserva {}", request.bookingId(), e);
            throw new PaymentGatewayException(
                    "No se pudo generar el pago. Intentalo de nuevo en unos minutos.", e);
        }
    }

    /** La preferencia que se le manda a MercadoPago. Aparte, para probarla sin llamarlo. */
    PreferenceRequest preferenceFor(CheckoutRequest request) {
        PreferenceItemRequest item = PreferenceItemRequest.builder()
                .title(request.concept())
                .quantity(1)
                // El importe ya viene exacto. Antes acá había un new BigDecimal(double), que es el
                // constructor que copia el error binario del double en lugar de redondearlo: un
                // total de 25500.300000000003 llegaba tal cual a la pasarela.
                .unitPrice(request.amount())
                .currencyId("ARS")
                .build();

        return PreferenceRequest.builder()
                .items(List.of(item))
                .backUrls(PreferenceBackUrlsRequest.builder()
                        .success(request.successUrl())
                        .pending(request.pendingUrl())
                        .failure(request.failureUrl())
                        .build())
                .autoReturn("approved")
                // Viaja con el pago y vuelve en la consulta: es lo que después permite comprobar
                // que un pago corresponde a esta reserva y no a otra.
                .externalReference(request.bookingId().toString())
                // Adónde avisa MercadoPago por su cuenta cuando el pago cambia de estado. Sin esto
                // no hay aviso automático y el cobro queda colgado de que el cliente vuelva.
                .notificationUrl(request.notificationUrl())
                // El link vence a la misma hora que la reserva pendiente: después ya la canceló la
                // limpieza automática, y un pago tardío no tendría qué confirmar.
                .expires(true)
                .expirationDateTo(request.expiresAt().atZone(TimeConfig.RESORT_ZONE).toOffsetDateTime())
                // Solo medios que acreditan al momento. El efectivo (cupón de Rapipago o Pago
                // Fácil, y cajeros) acredita días después, cuando la reserva ya venció.
                .paymentMethods(PreferencePaymentMethodsRequest.builder()
                        .excludedPaymentTypes(List.of(
                                PreferencePaymentTypeRequest.builder().id("ticket").build(),
                                PreferencePaymentTypeRequest.builder().id("atm").build()))
                        .build())
                .build();
    }

    /**
     * {@inheritDoc}
     *
     * <p>Devuelve vacío ante cualquier problema —identificador con formato raro, pago inexistente,
     * MercadoPago caído— en lugar de propagar la excepción. Es deliberado: quien llama usa esto
     * para decidir si confirmar una reserva, y <b>ante la duda no hay que confirmar</b>. Una
     * excepción que se propagara y quedara sin atender terminaría en un error en pantalla; un
     * vacío deja al cliente en «pago pendiente», que es lo correcto cuando no se pudo comprobar.
     */
    @Override
    public Optional<PaymentStatus> findPayment(String paymentId) {
        if (paymentId == null || paymentId.isBlank()) {
            return Optional.empty();
        }
        try {
            Payment pago = new PaymentClient().get(Long.valueOf(paymentId), requestOptions());
            return Optional.of(new PaymentStatus(
                    String.valueOf(pago.getId()),
                    pago.getStatus(),
                    pago.getTransactionAmount(),
                    bookingIdFrom(pago.getExternalReference()),
                    aprobadoEn(pago)));
        } catch (Exception e) {
            log.warn("No se pudo consultar el pago {} en MercadoPago: {}", paymentId, e.toString());
            return Optional.empty();
        }
    }

    /** La fecha de aprobación, pasada a la zona del balneario. Nula si el pago no se aprobó. */
    private LocalDateTime aprobadoEn(Payment pago) {
        return pago.getDateApproved() == null
                ? null
                : pago.getDateApproved().atZoneSameInstant(TimeConfig.RESORT_ZONE).toLocalDateTime();
    }

    /** La referencia externa es texto libre para MercadoPago; acá siempre es un id de reserva. */
    private Long bookingIdFrom(String externalReference) {
        try {
            return Long.valueOf(externalReference);
        } catch (RuntimeException e) {
            log.warn("El pago trae una referencia externa que no es un id de reserva: {}",
                    externalReference);
            return null;
        }
    }

    private MPRequestOptions requestOptions() {
        return MPRequestOptions.builder().accessToken(accessToken).build();
    }
}
