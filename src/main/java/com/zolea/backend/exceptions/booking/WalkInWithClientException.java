package com.zolea.backend.exceptions.booking;

/**
 * Una reserva de mostrador que vino con un {@code clientId}.
 *
 * <p>La de mostrador es para quien no tiene cuenta: el titular va a mano, con nombre y DNI. Con un
 * cliente adentro, un administrador podía armarse una reserva a su propio nombre, confirmada en el
 * acto, y después calificarla. Se traduce a HTTP 400.
 */
public class WalkInWithClientException extends IllegalArgumentException {
    public WalkInWithClientException(String message) {
        super(message);
    }
}
