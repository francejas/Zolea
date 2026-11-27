package com.zolea.backend.exceptions.guest;

public class GuestNotFoundException extends RuntimeException {
    public GuestNotFoundException(String message) {
        super(message);
    }

    /**
     * El código no existe, o es de una reserva de otro balneario: el mismo texto en los dos casos,
     * para que quien valida no se entere de las reservas de otro balneario.
     */
    public static GuestNotFoundException unknownCode() {
        return new GuestNotFoundException("El código ingresado no existe o es incorrecto.");
    }
}
