package com.zolea.backend.exceptions.rentalunit;

/**
 * El plano que se quiso guardar no vale (GH-68): dos unidades en la misma casilla, una unidad que no
 * es del balneario, una posición fuera de la grilla o una unidad dada de baja. Responde 400.
 */
public class InvalidPlanException extends RuntimeException {
    public InvalidPlanException(String message) {
        super(message);
    }
}
