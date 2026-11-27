package com.zolea.backend.exceptions.booking;

public class BookingNotFoundException extends RuntimeException {
    public BookingNotFoundException(String message) {
        super(message);
    }

    /**
     * La reserva no existe, o no es de quien la pide: el texto es el mismo en los dos casos, para no
     * revelar qué reservas existen.
     */
    public static BookingNotFoundException withId(Long id) {
        return new BookingNotFoundException("Reserva no encontrada con el ID: " + id);
    }
}
