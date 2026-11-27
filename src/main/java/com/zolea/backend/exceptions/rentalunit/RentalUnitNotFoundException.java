package com.zolea.backend.exceptions.rentalunit;

public class RentalUnitNotFoundException extends RuntimeException {
    public RentalUnitNotFoundException(String message) {
        super(message);
    }

    /** La unidad no existe, o es de otro balneario: el mismo texto en los dos casos. */
    public static RentalUnitNotFoundException withId(Long id) {
        return new RentalUnitNotFoundException("Unidad no encontrada con el ID: " + id);
    }
}
