package com.zolea.backend;

import com.zolea.backend.dtos.booking.BookingRequest;
import com.zolea.backend.dtos.booking.BookingResponse;
import com.zolea.backend.dtos.booking.GuestRequest;
import com.zolea.backend.exceptions.booking.UnitNotAvailableException;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Status;
import com.zolea.backend.services.BookingService;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Comportamiento del flujo de reserva que HOY es correcto y que el refactor no debe cambiar.
 *
 * <p>Estas pruebas son la red de seguridad: si alguna se pone en rojo durante un cambio posterior,
 * es una regresión, no una mejora. Las reglas que el bloque B corrigió viven en
 * {@link DomainRulesTest}.
 */
@DisplayName("Flujo de reserva — comportamiento a preservar")
class BookingFlowTest extends IntegrationTest {

    @Autowired
    private BookingService bookingService;

    @Test
    @DisplayName("reservar genera un QR para el cliente que reserva")
    void booking_createsQrForTheClient() {
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);

        BookingResponse response = bookingService.createBooking(new BookingRequest(
                today().plusDays(10), today().plusDays(13),
                client.getIdClient(), unit.getIdRentalUnit(),
                List.of(), null, null));

        assertThat(response.status()).isEqualTo(Status.PENDING);
        assertThat(response.guests()).hasSize(1);
        assertThat(response.guests().getFirst().qrToken()).isNotBlank();
        assertThat(response.guests().getFirst().isEntryValidated()).isFalse();
    }

    @Test
    @DisplayName("reservar con acompañantes genera un QR por cada uno, más el del titular")
    void booking_withCompanions_createsOneQrEach() {
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);

        BookingResponse response = bookingService.createBooking(new BookingRequest(
                today().plusDays(10), today().plusDays(13),
                client.getIdClient(), unit.getIdRentalUnit(),
                List.of(new GuestRequest("Acompañante Uno", "41000001"),
                        new GuestRequest("Acompañante Dos", "41000002")),
                null, null));

        assertThat(response.guests()).hasSize(3);
        assertThat(response.guests()).extracting("qrToken").doesNotContainNull();
    }

    @Test
    @DisplayName("no se puede reservar una unidad con fechas superpuestas")
    void booking_occupiedUnit_rejected() {
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);
        LocalDate desde = today().plusDays(10);

        bookingService.createBooking(new BookingRequest(
                desde, desde.plusDays(5), client.getIdClient(), unit.getIdRentalUnit(),
                List.of(), null, null));

        assertThatThrownBy(() -> bookingService.createBooking(new BookingRequest(
                desde.plusDays(2), desde.plusDays(7), client.getIdClient(), unit.getIdRentalUnit(),
                List.of(), null, null)))
                .isInstanceOf(UnitNotAvailableException.class);
    }

    @Test
    @DisplayName("dos reservas que comparten el día de borde se consideran superpuestas")
    void booking_adjacentRanges_rejected() {
        // Convención de fechas INCLUSIVA: si una reserva va del 10 al 12, el día 12 está ocupado,
        // así que otra que empiece el 12 choca. La consulta de disponibilidad ya funciona así.
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);
        LocalDate desde = today().plusDays(10);

        bookingService.createBooking(new BookingRequest(
                desde, desde.plusDays(2), client.getIdClient(), unit.getIdRentalUnit(),
                List.of(), null, null));

        assertThrows(UnitNotAvailableException.class, () -> bookingService.createBooking(new BookingRequest(
                desde.plusDays(2), desde.plusDays(4), client.getIdClient(), unit.getIdRentalUnit(),
                List.of(), null, null)));
    }

    @Test
    @DisplayName("una reserva cancelada libera la unidad")
    void booking_overACanceledOne_allowed() {
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);
        LocalDate desde = today().plusDays(10);
        aBooking(client, unit, desde, desde.plusDays(5), Status.CANCELED, now());

        BookingResponse response = bookingService.createBooking(new BookingRequest(
                desde, desde.plusDays(5), client.getIdClient(), unit.getIdRentalUnit(),
                List.of(), null, null));

        assertThat(response.id()).isNotNull();
    }

    @Test
    @DisplayName("confirmar el pago deja la reserva en CONFIRMED")
    void confirmPayment_leavesBookingConfirmed() {
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);
        BookingResponse creada = bookingService.createBooking(new BookingRequest(
                today().plusDays(10), today().plusDays(13),
                client.getIdClient(), unit.getIdRentalUnit(),
                List.of(), null, null));

        bookingService.confirmBookingPayment(creada.id());

        assertThat(bookingRepository.findById(creada.id()).orElseThrow().getStatus())
                .isEqualTo(Status.CONFIRMED);
    }

    @Test
    @DisplayName("el job cancela las reservas pendientes de hace 75 minutos o más")
    void cleanupJob_cancelsExpiredPending() {
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);
        Booking vencida = aBooking(client, unit, today().plusDays(30), today().plusDays(33),
                Status.PENDING, now().minusMinutes(80));

        bookingService.cancelExpiredBookings();

        assertThat(bookingRepository.findById(vencida.getId()).orElseThrow().getStatus())
                .isEqualTo(Status.CANCELED);
    }

    @Test
    @DisplayName("el job NO toca las reservas pendientes recientes")
    void cleanupJob_keepsRecentPending() {
        // Es la contraparte del bug del seed: con created_at fijo en el pasado, la primera
        // ejecución del cron dejaba la demo sin ninguna reserva PENDING. Desde el 07/11 el plazo
        // es de una hora: reciente es de hace minutos, como las pendientes de la demo.
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);
        Booking reciente = aBooking(client, unit, today().plusDays(30), today().plusDays(33),
                Status.PENDING, now().minusMinutes(10));

        bookingService.cancelExpiredBookings();

        assertThat(bookingRepository.findById(reciente.getId()).orElseThrow().getStatus())
                .isEqualTo(Status.PENDING);
    }
}
