package com.zolea.backend;

import com.zolea.backend.dtos.guest.GuestValidationResponse;
import com.zolea.backend.exceptions.guest.BookingNotInValidPeriodException;
import com.zolea.backend.exceptions.guest.BookingNotPaidException;
import com.zolea.backend.exceptions.guest.GuestAlreadyEnteredException;
import com.zolea.backend.exceptions.guest.GuestNotFoundException;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Guest;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Status;
import com.zolea.backend.services.GuestService;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Validación de ingreso por QR y por DNI: el flujo que se muestra con el escáner.
 *
 * <p>Todas las fechas se construyen relativas a {@code today()}, que sale del {@code Clock} inyectado
 * y no del reloj de la JVM. Sin eso, la ventana de ingreso dependía de la zona horaria del
 * contenedor y estas pruebas darían distinto según la hora a la que se corrieran.
 */
@DisplayName("Validación de ingreso — comportamiento a preservar")
class GuestEntryTest extends IntegrationTest {

    @Autowired
    private GuestService guestService;

    /** Una reserva confirmada y vigente hoy, con un huésped que todavía no ingresó. */
    private Guest huespedDeReservaVigente() {
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);
        Booking booking = aBooking(client, unit, today().minusDays(1), today().plusDays(1),
                Status.CONFIRMED, now().minusDays(5));
        return aGuest(booking, "Titular Vigente", client.getDni());
    }

    /** El balneario de la reserva del huésped: el del administrador que lo valida. */
    private Long resortOf(Guest guest) {
        return guest.getBooking().getRentalUnit().getResort().getIdResort();
    }

    @Test
    @DisplayName("un QR de una reserva vigente permite el ingreso y queda marcado")
    void validateQr_currentBooking_allowsEntry() {
        Guest guest = huespedDeReservaVigente();

        GuestValidationResponse response = guestService.validateGuestEntry(guest.getQrToken(), resortOf(guest));

        assertThat(response.fullName()).isEqualTo("Titular Vigente");
        assertThat(guestRepository.findById(guest.getIdGuest()).orElseThrow().getIsEntryValidated())
                .isTrue();
    }

    @Test
    @DisplayName("el mismo QR no se puede usar dos veces")
    void validateQr_twice_rejected() {
        Guest guest = huespedDeReservaVigente();
        guestService.validateGuestEntry(guest.getQrToken(), resortOf(guest));

        assertThatThrownBy(() -> guestService.validateGuestEntry(guest.getQrToken(), resortOf(guest)))
                .isInstanceOf(GuestAlreadyEnteredException.class);
    }

    @Test
    @DisplayName("un QR inexistente se rechaza")
    void validateQr_unknown_rejected() {
        Long resortId = aResort().getIdResort();

        assertThatThrownBy(() -> guestService.validateGuestEntry("no-existe-este-token", resortId))
                .isInstanceOf(GuestNotFoundException.class);
    }

    @Test
    @DisplayName("un QR de una reserva que todavía no empezó se rechaza")
    void validateQr_futureBooking_rejected() {
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);
        Booking futura = aBooking(client, unit, today().plusDays(5), today().plusDays(8),
                Status.CONFIRMED, now());
        Guest guest = aGuest(futura, "Titular Futuro", client.getDni());

        assertThatThrownBy(() -> guestService.validateGuestEntry(guest.getQrToken(), resortOf(guest)))
                .isInstanceOf(BookingNotInValidPeriodException.class);
    }

    @Test
    @DisplayName("un QR de una reserva vencida se rechaza")
    void validateQr_expiredBooking_rejected() {
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);
        Booking vencida = aBooking(client, unit, today().minusDays(10), today().minusDays(5),
                Status.CONFIRMED, now().minusDays(20));
        Guest guest = aGuest(vencida, "Titular Vencido", client.getDni());

        assertThatThrownBy(() -> guestService.validateGuestEntry(guest.getQrToken(), resortOf(guest)))
                .isInstanceOf(BookingNotInValidPeriodException.class);
    }

    @Test
    @DisplayName("un QR de una reserva sin pagar se rechaza")
    void validateQr_unpaidBooking_rejected() {
        Client client = aClient();
        RentalUnit unit = aUnit(10_000.0);
        Booking pendiente = aBooking(client, unit, today().minusDays(1), today().plusDays(1),
                Status.PENDING, now());
        Guest guest = aGuest(pendiente, "Titular Impago", client.getDni());

        assertThatThrownBy(() -> guestService.validateGuestEntry(guest.getQrToken(), resortOf(guest)))
                .isInstanceOf(BookingNotPaidException.class);
    }

    @Test
    @DisplayName("el DNI del titular permite el ingreso sin el QR")
    void validateId_currentBooking_allowsEntry() {
        Guest guest = huespedDeReservaVigente();

        GuestValidationResponse response = guestService.validateGuestEntryByDni(guest.getDni(), resortOf(guest));

        assertThat(response.fullName()).isEqualTo("Titular Vigente");
        assertThat(guestRepository.findById(guest.getIdGuest()).orElseThrow().getIsEntryValidated())
                .isTrue();
    }

    @Test
    @DisplayName("un DNI ya validado se rechaza")
    void validateId_twice_rejected() {
        Guest guest = huespedDeReservaVigente();
        guestService.validateGuestEntryByDni(guest.getDni(), resortOf(guest));

        assertThatThrownBy(() -> guestService.validateGuestEntryByDni(guest.getDni(), resortOf(guest)))
                .isInstanceOf(GuestAlreadyEnteredException.class);
    }

    @Test
    @DisplayName("un DNI sin reserva confirmada se rechaza")
    void validateId_withoutBooking_rejected() {
        Long resortId = aResort().getIdResort();

        assertThatThrownBy(() -> guestService.validateGuestEntryByDni("99999999", resortId))
                .isInstanceOf(GuestNotFoundException.class);
    }

    @Test
    @DisplayName("el DNI cargado en una reserva presencial permite el ingreso")
    void validateId_walkIn_allowsEntry() {
        Client mostrador = aClient();
        RentalUnit unit = aUnit(10_000.0);
        Booking walkIn = aBooking(mostrador, unit, today(), today().plusDays(1),
                Status.CONFIRMED, now());
        walkIn.setWalkInName("Persona De Mostrador");
        walkIn.setWalkInDni("38421567");
        bookingRepository.save(walkIn);
        // El huésped de una walk-in no hereda DNI: se lo alcanza por el de la reserva.
        aGuest(walkIn, "Persona De Mostrador", null);

        GuestValidationResponse response =
                guestService.validateGuestEntryByDni("38421567", unit.getResort().getIdResort());

        assertThat(response.fullName()).isEqualTo("Persona De Mostrador");
    }
}
