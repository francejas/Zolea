package com.zolea.backend;

import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Status;
import com.zolea.backend.payments.CheckoutRequest;
import com.zolea.backend.payments.PaymentGateway;
import com.zolea.backend.payments.PaymentStatus;
import com.zolea.backend.repositories.PaymentRepository;
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
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.endsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Una reserva se confirma solo si la pasarela dice que se pagó.
 *
 * <p>La dirección a la que MercadoPago devuelve al cliente es pública —tiene que serlo: quien
 * llega ahí viene del sitio de MercadoPago, sin el token de la aplicación—. Antes, ese endpoint
 * confirmaba la reserva con el número que venía en la URL y <b>descartaba</b> el estado que
 * MercadoPago informaba. Como esa URL la escribe el navegador, cualquiera que conociera el número
 * de una reserva pendiente podía marcarla como pagada y quedarse con los códigos QR. Los números
 * son consecutivos.
 *
 * <p>Estas pruebas existen gracias al puerto {@code PaymentGateway}: sin él habría que pegarle a
 * MercadoPago de verdad para probar el flujo, que es exactamente lo que la auditoría señalaba como
 * imposible. Acá se sustituye por una pasarela de mentira a la que la prueba le dicta qué pagos
 * conoce y en qué estado están.
 */
@AutoConfigureMockMvc
@Import(VerifiedPaymentTest.FakePaymentGateway.class)
@DisplayName("Pagos — confirmar solo contra la pasarela")
class VerifiedPaymentTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private FakePaymentGateway pasarela;
    @Autowired private PaymentRepository paymentRepository;

    @BeforeEach
    void clearTheGateway() {
        pasarela.forgetEverything();
    }

    /** Una reserva pendiente de pago, del cliente que sea. */
    private Booking aPendingBooking() {
        Client client = aClient();
        return aBooking(client, aUnit(new BigDecimal("10000.00")),
                today().plusDays(10), today().plusDays(12), Status.PENDING, now());
    }

    /** Pide la dirección de retorno tal como la abriría el navegador del cliente. */
    private void returnFromPayment(Object bookingId, String collectionId) throws Exception {
        mockMvc.perform(get("/api/bookings/success")
                        .param("collection_id", String.valueOf(collectionId))
                        .param("external_reference", String.valueOf(bookingId)))
                .andExpect(status().is3xxRedirection());
    }

    private Status statusOf(Long bookingId) {
        syncWithDatabase();
        return bookingRepository.findById(bookingId).orElseThrow().getStatus();
    }

    // ---------------------------------------------------------------------

    @Test
    @DisplayName("con un pago aprobado de esa reserva, la confirma")
    void approvedPayment_confirmsTheBooking() throws Exception {
        Booking reserva = aPendingBooking();
        pasarela.registerPayment("PAGO-1", "approved", reserva.getId());
        syncWithDatabase();

        returnFromPayment(reserva.getId(), "PAGO-1");

        assertThat(statusOf(reserva.getId())).isEqualTo(Status.CONFIRMED);
    }

    @Test
    @DisplayName("sin ningún pago registrado, NO la confirma")
    void noPayment_doesNotConfirm() throws Exception {
        Booking reserva = aPendingBooking();
        syncWithDatabase();

        // Esto es el ataque: abrir la dirección de retorno con el número de una reserva ajena,
        // inventando un identificador de pago. Antes alcanzaba para llevarse los QR.
        returnFromPayment(reserva.getId(), "PAGO-INVENTADO");

        assertThat(statusOf(reserva.getId()))
                .withFailMessage("la reserva se confirmó sin que existiera ningún pago")
                .isEqualTo(Status.PENDING);
    }

    @Test
    @DisplayName("con un pago que la pasarela no dio por aprobado, NO la confirma")
    void unapprovedPayment_doesNotConfirm() throws Exception {
        Booking reserva = aPendingBooking();
        pasarela.registerPayment("PAGO-2", "rejected", reserva.getId());
        syncWithDatabase();

        returnFromPayment(reserva.getId(), "PAGO-2");

        assertThat(statusOf(reserva.getId())).isEqualTo(Status.PENDING);
    }

    @Test
    @DisplayName("con el comprobante de un pago de OTRA reserva, NO la confirma")
    void paymentForAnotherBooking_doesNotConfirm() throws Exception {
        Booking miReserva = aPendingBooking();
        Booking reservaAjena = aPendingBooking();
        // Un pago aprobado de verdad, pero de otra reserva: podría ser uno propio y barato.
        pasarela.registerPayment("PAGO-3", "approved", reservaAjena.getId());
        syncWithDatabase();

        returnFromPayment(miReserva.getId(), "PAGO-3");

        assertThat(statusOf(miReserva.getId()))
                .withFailMessage("se confirmó una reserva con el comprobante de otra")
                .isEqualTo(Status.PENDING);
    }

    @Test
    @DisplayName("con un pago aprobado para una reserva ya cancelada, redirige sin error, guarda el pago y no la revive")
    void approvedPaymentForCanceledBooking_redirectsAndKeepsItCanceled() throws Exception {
        Booking reserva = aBooking(aClient(), aUnit(new BigDecimal("10000.00")),
                today().plusDays(10), today().plusDays(12), Status.CANCELED, now().minusMinutes(80));
        pasarela.registerPayment("PAGO-TARDE", "approved", reserva.getId());
        syncWithDatabase();

        mockMvc.perform(get("/api/bookings/success")
                        .param("collection_id", "PAGO-TARDE")
                        .param("external_reference", String.valueOf(reserva.getId())))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", endsWith("/payment/pending")));

        assertThat(statusOf(reserva.getId())).isEqualTo(Status.CANCELED);
        assertThat(paymentRepository.existsByGatewayPaymentId("PAGO-TARDE"))
                .withFailMessage("el cobro de una reserva cancelada no quedó registrado")
                .isTrue();
    }

    @Test
    @DisplayName("sin identificador de pago no falla: redirige a pendiente")
    void missingPaymentId_doesNotBreak() throws Exception {
        Booking reserva = aPendingBooking();
        syncWithDatabase();

        // Los tres parámetros eran obligatorios: si MercadoPago no mandaba uno, el cliente veía
        // un error en pantalla en lugar de su reserva.
        mockMvc.perform(get("/api/bookings/success")
                        .param("external_reference", String.valueOf(reserva.getId())))
                .andExpect(status().is3xxRedirection());

        assertThat(statusOf(reserva.getId())).isEqualTo(Status.PENDING);
    }

    // ---------------------------------------------------------------------

    /**
     * Una pasarela que solo conoce los pagos que la prueba le registra.
     *
     * <p>Es una implementación escrita a mano y no un simulacro generado: se le pregunta por el
     * estado real de la reserva en la base, no por si se la llamó. Lo que se está probando es el
     * comportamiento del sistema, no la conversación con la pasarela.
     */
    @TestConfiguration
    public static class FakePaymentGateway implements PaymentGateway {

        private final Map<String, PaymentStatus> pagos = new HashMap<>();

        @Bean
        @Primary
        PaymentGateway fakePaymentGateway() {
            return this;
        }

        void registerPayment(String id, String estado, Long idReserva) {
            pagos.put(id, new PaymentStatus(id, estado, new BigDecimal("10000.00"), idReserva, null));
        }

        void forgetEverything() {
            pagos.clear();
        }

        @Override
        public String createCheckout(CheckoutRequest request) {
            return "https://pasarela.de.mentira/checkout/" + request.bookingId();
        }

        @Override
        public Optional<PaymentStatus> findPayment(String paymentId) {
            return Optional.ofNullable(pagos.get(paymentId));
        }
    }
}
