package com.zolea.backend.security;

import com.zolea.backend.repositories.BookingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Único punto donde vive la regla «esta reserva es de este cliente».
 *
 * <p>Se consulta desde las anotaciones de autorización de los endpoints con
 * {@code @bookingAccess.canAccess(#id, principal.idClient)}. La regla estaba repetida y comparando
 * emails dentro del servicio, y en las lecturas simplemente no estaba: tenerla en un solo lugar es
 * lo que evita que el próximo endpoint que lea una reserva se olvide de comprobarla.
 */
@Component("bookingAccess")
@RequiredArgsConstructor
public class BookingAccessPolicy {

    private final BookingRepository bookingRepository;

    /**
     * Si ese cliente puede acceder a esa reserva.
     *
     * <p><b>Una reserva que no existe se deja pasar a propósito.</b> Hay dos contratos posibles y
     * hubo que elegir uno:
     *
     * <ul>
     *   <li>Negar el acceso a todo id cuya pertenencia no se pueda demostrar. No revela si la
     *       reserva existe, pero devuelve 403 cuando el propio dueño pide una reserva borrada, que
     *       es un 404 legítimo.
     *   <li>Dejar pasar lo inexistente para que el endpoint devuelva su 404, y reservar el 403 para
     *       la reserva que existe y es de otro. Revela si un id está usado.
     * </ul>
     *
     * <p>Se eligió el segundo. Lo que se filtra es la existencia de un id consecutivo, que no
     * habilita nada: la lectura sigue cerrada y el {@code qrToken} no sale. A cambio, el código de
     * estado significa siempre lo mismo —404 es «no está», 403 es «no es tuyo»—, que es lo que el
     * frontend necesita para decidir si mostrar «reserva inexistente» o «sin permiso».
     *
     * <p>Las reservas de mostrador no tienen titular, así que solo las alcanza un ADMIN.
     */
    @Transactional(readOnly = true)
    public boolean canAccess(Long bookingId, Long idClient) {
        if (bookingId == null || idClient == null) {
            return false;
        }
        return bookingRepository.findById(bookingId)
                .map(booking -> booking.getClient() != null
                        && idClient.equals(booking.getClient().getIdClient()))
                .orElse(true); // no existe: que el endpoint devuelva 404
    }

    /**
     * Si esa reserva es de una unidad de ese balneario. Mismo criterio que {@link #canAccess}: lo
     * que no existe pasa, para que el endpoint devuelva su 404. Un administrador sin balneario
     * asignado no alcanza ninguna.
     */
    @Transactional(readOnly = true)
    public boolean inResort(Long bookingId, Long idResort) {
        if (bookingId == null || idResort == null) {
            return false;
        }
        return bookingRepository.findById(bookingId)
                .map(booking -> booking.getRentalUnit() != null
                        && booking.getRentalUnit().getResort() != null
                        && idResort.equals(booking.getRentalUnit().getResort().getIdResort()))
                .orElse(true); // no existe: que el endpoint devuelva 404
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
}
