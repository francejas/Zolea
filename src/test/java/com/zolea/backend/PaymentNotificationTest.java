package com.zolea.backend;

import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Status;
import com.zolea.backend.payments.CheckoutRequest;
import com.zolea.backend.payments.PaymentGateway;
import com.zolea.backend.payments.PaymentStatus;
import com.zolea.backend.repositories.PaymentRepository;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MercadoPago nos avisa por su cuenta, sin pasar por el navegador del cliente.
 *
 * <p>Hasta ahora la reserva se confirmaba cuando el cliente volvía del sitio de MercadoPago. Eso
 * deja el cobro colgado de algo que no controlamos: si el cliente cierra la pestaña, se queda sin
 * señal o simplemente no vuelve, <b>nunca nos enteramos de que pagó</b>. La reserva queda pendiente
 * y pasado el plazo de pago el trabajo automático la cancela, con la plata ya cobrada.
 *
 * <p>El aviso automático —lo que la documentación de MercadoPago llama <i>webhook</i> o <i>IPN</i>—
 * saca al navegador del medio: los servidores de MercadoPago llaman a los nuestros apenas el pago
 * cambia de estado.
 *
 * <p>Eso trae tres condiciones que estas pruebas fijan:
 *
 * <ol>
 *   <li><b>El aviso llega repetido.</b> Si no contestamos, MercadoPago reintenta. Procesar el mismo
 *       aviso dos veces no puede generar dos huéspedes con dos códigos QR.
 *   <li><b>El aviso casi no trae datos:</b> solo el número del pago. Hay que preguntarle a la
 *       pasarela, igual que en el retorno — no se le cree a lo que llega de afuera.
 *   <li><b>Es una dirección pública:</b> MercadoPago no tiene el token de la aplicación.
 * </ol>
 */
@AutoConfigureMockMvc
@Import(PaymentNotificationTest.FakePaymentGateway.class)
@DisplayName("Pagos — el aviso automático de MercadoPago")
class PaymentNotificationTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private FakePaymentGateway gateway;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private PaymentRepository paymentRepository;

    @BeforeEach
    void clearTheGateway() {
        gateway.forgetEverything();
    }

    private Booking aPendingBooking() {
        Client client = aClient();
        return aBooking(client, aUnit(new BigDecimal("10000.00")),
                today().plusDays(10), today().plusDays(12), Status.PENDING, now());
    }

    /** El aviso, tal como lo manda MercadoPago: el tipo y el id del pago, nada más. */
    private void mercadoPagoNotifies(String paymentId) throws Exception {
        mockMvc.perform(post("/api/bookings/notifications")
                        .param("type", "payment")
                        .param("data.id", paymentId))
                .andExpect(status().isOk());
    }

    private Status statusOf(Long bookingId) {
        syncWithDatabase();
        return bookingRepository.findById(bookingId).orElseThrow().getStatus();
    }

    // ---------------------------------------------------------------------

    @Test
    @DisplayName("avisa de un pago aprobado y la reserva se confirma sin que el cliente vuelva")
    void approvedPaymentNotification_confirmsWithoutTheClientReturning() throws Exception {
        Booking booking = aPendingBooking();
        gateway.registerPayment("PAGO-1", "approved", booking.getId());
        syncWithDatabase();

        // El cliente cerró la pestaña: nadie visita /success. Solo llega el aviso.
        mercadoPagoNotifies("PAGO-1");

        assertThat(statusOf(booking.getId()))
                .withFailMessage("la reserva quedó pendiente aunque MercadoPago avisó del pago")
                .isEqualTo(Status.CONFIRMED);
    }

    @Test
    @DisplayName("el mismo aviso repetido no duplica los códigos QR")
    void repeatedNotification_doesNotDuplicateQrCodes() throws Exception {
        Booking booking = aPendingBooking();
        gateway.registerPayment("PAGO-2", "approved", booking.getId());
        syncWithDatabase();

        // MercadoPago reintenta cuando no recibe respuesta a tiempo: el mismo aviso, tres veces.
        mercadoPagoNotifies("PAGO-2");
        mercadoPagoNotifies("PAGO-2");
        mercadoPagoNotifies("PAGO-2");

        syncWithDatabase();
        assertThat(statusOf(booking.getId())).isEqualTo(Status.CONFIRMED);
        assertThat(guestRepository.count())
                .withFailMessage("tres avisos del mismo pago generaron más de un huésped")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("avisa de un pago que la pasarela no dio por aprobado y NO confirma")
    void unapprovedPaymentNotification_doesNotConfirm() throws Exception {
        Booking booking = aPendingBooking();
        gateway.registerPayment("PAGO-3", "in_process", booking.getId());
        syncWithDatabase();

        mercadoPagoNotifies("PAGO-3");

        assertThat(statusOf(booking.getId())).isEqualTo(Status.PENDING);
    }

    @Test
    @DisplayName("avisa de un pago que la pasarela no conoce y NO confirma")
    void unknownPaymentNotification_doesNotConfirm() throws Exception {
        Booking booking = aPendingBooking();
        syncWithDatabase();

        // La dirección es pública: cualquiera puede inventar un aviso. Se comprueba contra la
        // pasarela, así que inventar un número no alcanza.
        mercadoPagoNotifies("PAGO-INVENTADO");

        assertThat(statusOf(booking.getId()))
                .withFailMessage("se confirmó una reserva con un aviso inventado")
                .isEqualTo(Status.PENDING);
    }

    @Test
    @DisplayName("un pago aprobado para una reserva ya cancelada se guarda una sola vez, responde 200 y la reserva sigue cancelada")
    void approvedPaymentForCanceledBooking_isRecordedOnceAndAcknowledged() throws Exception {
        // La limpieza la canceló mientras MercadoPago aprobaba un pago que había empezado antes.
        Booking booking = aBooking(aClient(), aUnit(new BigDecimal("10000.00")),
                today().plusDays(10), today().plusDays(12), Status.CANCELED, now().minusMinutes(80));
        gateway.registerPayment("PAGO-TARDE", "approved", booking.getId());
        syncWithDatabase();

        // Si respondiera con error, MercadoPago lo reintentaría sin fin: llega dos veces igual.
        mercadoPagoNotifies("PAGO-TARDE");
        mercadoPagoNotifies("PAGO-TARDE");

        syncWithDatabase();
        assertThat(paymentRepository.count())
                .withFailMessage("el cobro de una reserva cancelada no quedó registrado una sola vez")
                .isEqualTo(1);
        assertThat(paymentRepository.findByGatewayPaymentId("PAGO-TARDE").orElseThrow()
                .getBooking().getId()).isEqualTo(booking.getId());
        assertThat(statusOf(booking.getId())).isEqualTo(Status.CANCELED);
    }

    @Test
    @DisplayName("un aviso que no es de un pago se acepta y se ignora")
    void nonPaymentNotification_isAcknowledgedAndIgnored() throws Exception {
        // MercadoPago manda avisos de varios tipos por la misma dirección. Los que no son de un
        // pago hay que contestarlos con 200 igual, o los reintenta para siempre.
        mockMvc.perform(post("/api/bookings/notifications")
                        .param("type", "plan")
                        .param("data.id", "123"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("un aviso sin número de pago se acepta y se ignora")
    void notificationWithoutPaymentId_isAcknowledgedAndIgnored() throws Exception {
        mockMvc.perform(post("/api/bookings/notifications")
                        .param("type", "payment"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("el cobro le declara a MercadoPago adónde mandar los avisos")
    void theCheckoutDeclaresWhereToSendNotifications() throws Exception {
        Client client = aClient();
        syncWithDatabase();

        // Sin esto, MercadoPago no tiene adónde avisar y todo lo anterior es teoría: nunca nos
        // llegaría un aviso.
        mockMvc.perform(post("/api/bookings")
                        .header("Authorization", "Bearer " + jwt(client))
                        .contentType("application/json")
                        .content("""
                                {"startDate":"%s","endDate":"%s","clientId":%d,
                                 "rentalUnitId":%d,"guests":[]}
                                """.formatted(today().plusDays(20), today().plusDays(22),
                                client.getIdClient(), aUnit(new BigDecimal("5000.00")).getIdRentalUnit())))
                .andExpect(status().isCreated());

        assertThat(gateway.lastRequest()).isNotNull();
        assertThat(gateway.lastRequest().notificationUrl())
                .withFailMessage("el cobro no le dice a MercadoPago adónde avisar")
                .isNotBlank()
                .endsWith("/api/bookings/notifications");
    }

    private String jwt(Client client) {
        return jwtUtil.generateToken(UserPrincipal.de(client));
    }

    // ---------------------------------------------------------------------

    /** Una pasarela que solo conoce los pagos que la prueba le registra. */
    @TestConfiguration
    public static class FakePaymentGateway implements PaymentGateway {

        private final Map<String, PaymentStatus> payments = new HashMap<>();
        private final List<CheckoutRequest> requests = new ArrayList<>();

        @Bean
        @Primary
        PaymentGateway fakePaymentGateway() {
            return this;
        }

        void registerPayment(String id, String status, Long bookingId) {
            payments.put(id, new PaymentStatus(id, status, new BigDecimal("10000.00"), bookingId, null));
        }

        void forgetEverything() {
            payments.clear();
            requests.clear();
        }

        CheckoutRequest lastRequest() {
            return requests.isEmpty() ? null : requests.getLast();
        }

        @Override
        public String createCheckout(CheckoutRequest request) {
            requests.add(request);
            return "https://pasarela.de.mentira/checkout/" + request.bookingId();
        }

        @Override
        public Optional<PaymentStatus> findPayment(String paymentId) {
            return Optional.ofNullable(payments.get(paymentId));
        }
    }
}
