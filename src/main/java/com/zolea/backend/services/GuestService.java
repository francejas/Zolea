package com.zolea.backend.services;

import com.zolea.backend.dtos.guest.GuestValidationResponse;
import com.zolea.backend.exceptions.guest.BookingNotInValidPeriodException;
import com.zolea.backend.exceptions.guest.BookingNotPaidException;
import com.zolea.backend.exceptions.guest.GuestAlreadyEnteredException;
import com.zolea.backend.exceptions.guest.GuestNotFoundException;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Guest;
import com.zolea.backend.models.Status;
import com.zolea.backend.repositories.GuestRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class GuestService {

    private final GuestRepository guestRepository;
    private final Clock clock;

    private static final DateTimeFormatter DMY = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    /** Hoy en la zona del balneario. Ver {@link com.zolea.backend.config.TimeConfig}. */
    private LocalDate today() {
        return LocalDate.now(clock);
    }

    /**
     * Valida el ingreso de un huésped por su código QR.
     *
     * <p>Las tres comprobaciones, en este orden: que la reserva esté <b>confirmada</b> —o sea,
     * pagada—, que <b>hoy</b> caiga dentro de sus fechas, y que ese código <b>no se haya usado
     * antes</b>. La última es la que impide que un mismo QR reenviado por mensaje haga entrar a
     * varias personas: el ingreso se marca como validado y el código queda quemado.
     *
     * <p>Los mensajes de error son explícitos a propósito («la reserva todavía no comenzó», «ya
     * registró su ingreso»): del otro lado hay un operador con la persona parada enfrente, que
     * necesita saber qué pasó para poder resolverlo.
     *
     * <p>Antes que todo eso, que la reserva sea del balneario de quien valida: un administrador no
     * marca ingresos de otro balneario, y tampoco se entera de en qué estado está esa reserva.
     *
     * @param token el {@code qrToken} que el escáner leyó del código.
     * @param resortId el balneario del administrador que valida.
     * @return los datos del huésped que acaba de ingresar.
     * @throws com.zolea.backend.exceptions.guest.GuestNotFoundException si el código no existe.
     * @throws org.springframework.security.access.AccessDeniedException si la reserva es de otro balneario.
     * @throws com.zolea.backend.exceptions.guest.BookingNotPaidException si la reserva no está confirmada.
     * @throws com.zolea.backend.exceptions.guest.GuestAlreadyEnteredException si el código ya se usó.
     */
    @Transactional
    public GuestValidationResponse validateGuestEntry(String token, Long resortId) {
        Guest guest = guestRepository.findByQrToken(token)
                .orElseThrow(() -> new GuestNotFoundException("El código ingresado no existe o es incorrecto."));

        if (!resortId.equals(guest.getBooking().getRentalUnit().getResort().getIdResort())) {
            throw new AccessDeniedException("Ese código es de una reserva de otro balneario.");
        }

        if (guest.getBooking().getStatus() != Status.CONFIRMED) {
            throw new BookingNotPaidException("La reserva asociada a este código aún figura como " + guest.getBooking().getStatus() + ". Debe abonarse antes de ingresar.");
        }

        checkBookingPeriod(guest.getBooking());

        if (guest.getIsEntryValidated()) {
            throw new GuestAlreadyEnteredException("ALERTA: Este código ya registró su ingreso al balneario.");
        }

        return confirmEntry(guest);
    }

    /**
     * Valida el ingreso por DNI, para cuando el huésped no tiene el código a mano.
     *
     * <p>Es el camino alternativo al QR, y existe por un motivo práctico: es un balneario, no un
     * aeropuerto. Dejar afuera a alguien que pagó porque se le apagó el teléfono es un problema peor
     * que el que el código resuelve.
     *
     * <p>Es más débil que el QR —un DNI tiene ocho dígitos y se puede adivinar— así que se acota por
     * los dos lados: solo considera reservas <b>confirmadas</b> y <b>vigentes hoy</b>, y el ingreso
     * se marca como usado igual que con el código. Un DNI acertado sirve una sola vez y deja al
     * titular real sin poder entrar, que es un problema visible en el momento.
     *
     * <p>Cuando hay reservas con ese DNI pero ninguna vigente, el mensaje dice <b>cuál</b> es el
     * caso: si la más próxima todavía no empezó, informa desde cuándo; si todas terminaron, que ya
     * venció. Es información que el operador necesita para atender a la persona.
     *
     * <p>Busca solo entre las reservas del balneario de quien valida: las de otros balnearios no
     * existen para él, ni siquiera para decirle que todavía no empezaron.
     *
     * @param dni el documento que el operador cargó.
     * @param resortId el balneario del administrador que valida.
     * @return los datos del huésped que acaba de ingresar.
     * @throws com.zolea.backend.exceptions.guest.GuestNotFoundException si no hay ninguna reserva confirmada con ese DNI en el balneario.
     * @throws com.zolea.backend.exceptions.guest.BookingNotInValidPeriodException si ninguna está vigente hoy.
     * @throws com.zolea.backend.exceptions.guest.GuestAlreadyEnteredException si ya registró su ingreso.
     */
    @Transactional
    public GuestValidationResponse validateGuestEntryByDni(String dni, Long resortId) {
        List<Guest> guests = guestRepository.findConfirmedByDniInResort(dni, resortId);

        if (guests.isEmpty()) {
            throw new GuestNotFoundException("No se encontró una reserva confirmada con el DNI ingresado.");
        }

        LocalDate today = today();

        // Solo huéspedes cuya reserva esté vigente hoy (inicio <= hoy <= fin).
        List<Guest> active = guests.stream()
                .filter(g -> !today.isBefore(g.getBooking().getStartDate())
                        && !today.isAfter(g.getBooking().getEndDate()))
                .toList();

        if (active.isEmpty()) {
            // Hay reservas con ese DNI, pero ninguna vigente hoy. Mensaje según próxima/última.
            Optional<Guest> future = guests.stream()
                    .filter(g -> today.isBefore(g.getBooking().getStartDate()))
                    .min(Comparator.comparing(g -> g.getBooking().getStartDate()));
            if (future.isPresent()) {
                throw new BookingNotInValidPeriodException(
                        "La reserva con ese DNI todavía no comenzó. El ingreso se habilita el "
                                + future.get().getBooking().getStartDate().format(DMY) + ".");
            }
            Guest latest = guests.stream()
                    .max(Comparator.comparing(g -> g.getBooking().getEndDate()))
                    .orElseThrow();
            throw new BookingNotInValidPeriodException(
                    "La reserva con ese DNI venció el " + latest.getBooking().getEndDate().format(DMY)
                            + ". El ingreso ya no está disponible.");
        }

        Guest guest = active.stream()
                .filter(g -> !g.getIsEntryValidated())
                .findFirst()
                .orElseThrow(() -> new GuestAlreadyEnteredException("ALERTA: El ingreso para este DNI ya fue registrado."));

        return confirmEntry(guest);
    }

    private GuestValidationResponse confirmEntry(Guest guest) {
        guest.setIsEntryValidated(true);
        guestRepository.save(guest);

        String unitIdentifier = guest.getBooking().getRentalUnit().getIdentifier();

        return new GuestValidationResponse(
                guest.getIdGuest(),
                guest.getFullName(),
                unitIdentifier,
                "¡Acceso Permitido! Dirigirse a la unidad: " + unitIdentifier
        );
    }

    /** Rechaza el ingreso si hoy está fuera de la ventana [startDate, endDate] de la reserva. */
    private void checkBookingPeriod(Booking booking) {
        LocalDate today = today();
        if (today.isBefore(booking.getStartDate())) {
            throw new BookingNotInValidPeriodException(
                    "La reserva todavía no comenzó. El ingreso se habilita el "
                            + booking.getStartDate().format(DMY) + ".");
        }
        if (today.isAfter(booking.getEndDate())) {
            throw new BookingNotInValidPeriodException(
                    "La reserva venció el " + booking.getEndDate().format(DMY)
                            + ". El ingreso ya no está disponible.");
        }
    }
}
