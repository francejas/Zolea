package com.zolea.backend.exceptions.rentalunit;

/**
 * La operación no vale para una unidad dada de baja, o la baja no se puede hacer todavía. El
 * {@code GlobalExceptionHandler} la traduce a HTTP 400.
 */
public class RentalUnitRetiredException extends RuntimeException {
    public RentalUnitRetiredException(String message) {
        super(message);
    }
}
