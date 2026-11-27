package com.zolea.backend.security;

import com.zolea.backend.exceptions.booking.BookingNotFoundException;
import com.zolea.backend.models.Booking;
import com.zolea.backend.repositories.BookingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.function.Predicate;

/**
 * Único punto donde vive la regla «esta reserva es de este cliente».
 *
 * <p>Se consulta desde las anotaciones de autorización de los endpoints con
 * {@code @bookingAccess.canAccess(#id, principal.idClient)}. La regla estaba repetida y comparando
 * emails dentro del servicio, y en las lecturas simplemente no estaba: tenerla en un solo lugar es
 * lo que evita que el próximo endpoint que lea una reserva se olvide de comprobarla.
 *
 * <p><b>Una reserva ajena responde como una que no existe</b> (desde el 26/11): 404, con el mismo
 * texto. Hasta entonces era un 403 «no es tuya», y con eso, probando números, se sabía qué reservas
 * había. Por eso los métodos no devuelven {@code false} ante una reserva ajena: lanzan el mismo
 * {@link BookingNotFoundException} que el endpoint lanzaría si no existiera. El {@code false}, que
 * se traduce en 403, queda para el tipo de cuenta: un administrador sin balneario asignado.
 */
@Component("bookingAccess")
@RequiredArgsConstructor
public class BookingAccessPolicy {

    private final BookingRepository bookingRepository;

    /**
     * Si ese cliente puede acceder a esa reserva: {@code true} si es suya, y si es de otro, el 404
     * de «no existe». Una que no existe pasa, para que el endpoint devuelva su 404.
     *
     * <p>Las reservas de mostrador no tienen titular, así que solo las alcanza un ADMIN.
     */
    @Transactional(readOnly = true)
    public boolean canAccess(Long bookingId, Long idClient) {
        if (bookingId == null || idClient == null) {
            return false;
        }
        return requireOwn(bookingId, booking -> booking.getClient() != null
                && idClient.equals(booking.getClient().getIdClient()));
    }

    /**
     * Si esa reserva es de una unidad de ese balneario, con el mismo criterio que
     * {@link #canAccess}. Un administrador sin balneario asignado no alcanza ninguna: 403.
     */
    @Transactional(readOnly = true)
    public boolean inResort(Long bookingId, Long idResort) {
        if (bookingId == null || idResort == null) {
            return false;
        }
        return requireOwn(bookingId, booking -> booking.getRentalUnit() != null
                && booking.getRentalUnit().getResort() != null
                && idResort.equals(booking.getRentalUnit().getResort().getIdResort()));
    }

    /**
     * Quién puede ver una reserva y operar sobre ella (RNF03): el cliente dueño, o el administrador
     * del balneario de la reserva. Hasta la 15.5 alcanzaba con ser administrador, de cualquier
     * balneario: el de Mar del Plata leía las reservas de Ocean View, con sus códigos QR.
     *
     * <p>Un administrador se mide solo por su balneario, aunque la reserva figure a su nombre.
     */
    @Transactional(readOnly = true)
    public boolean canRead(Long bookingId, UserPrincipal principal) {
        if (principal == null) {
            return false;
        }
        return principal.isAdmin()
                ? inResort(bookingId, principal.idManagedResort())
                : canAccess(bookingId, principal.idClient());
    }

    /** {@code true} si es de quien pide o no existe; si existe y es de otro, el 404 de «no existe». */
    private boolean requireOwn(Long bookingId, Predicate<Booking> isOwn) {
        boolean someoneElses = bookingRepository.findById(bookingId)
                .map(booking -> !isOwn.test(booking))
                .orElse(false); // no existe: que el endpoint devuelva su 404
        if (someoneElses) {
            throw BookingNotFoundException.withId(bookingId);
        }
        return true;
    }
}
