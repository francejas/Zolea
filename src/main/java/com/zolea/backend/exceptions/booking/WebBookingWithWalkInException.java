package com.zolea.backend.exceptions.booking;

/**
 * Una reserva web que vino con los datos de mostrador ({@code walkInName} o {@code walkInDni}).
 *
 * <p>Esos datos son para quien no tiene cuenta, y solo los carga el administrador en el mostrador.
 * La reserva web siempre es del cliente que la pide. Se traduce a HTTP 400.
 */
public class WebBookingWithWalkInException extends IllegalArgumentException {
    public WebBookingWithWalkInException(String message) {
        super(message);
    }
}
