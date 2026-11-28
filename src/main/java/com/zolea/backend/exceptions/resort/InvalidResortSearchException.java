package com.zolea.backend.exceptions.resort;

/**
 * Un filtro de puntaje o un orden inválidos en la búsqueda de la Portada (#73): {@code minRating}
 * o {@code stars} fuera de 1 a 5, o un {@code sort} que no existe. Responde 400 con el motivo.
 */
public class InvalidResortSearchException extends RuntimeException {
    public InvalidResortSearchException(String message) {
        super(message);
    }
}
