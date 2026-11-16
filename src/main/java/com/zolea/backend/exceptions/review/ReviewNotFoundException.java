package com.zolea.backend.exceptions.review;

/** La reserva existe pero todavía no se calificó: no hay reseña para leer ni para editar. */
public class ReviewNotFoundException extends RuntimeException {
    public ReviewNotFoundException(String message) {
        super(message);
    }
}
