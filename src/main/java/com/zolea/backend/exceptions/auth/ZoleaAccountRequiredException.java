package com.zolea.backend.exceptions.auth;

/**
 * Un administrador con balneario quiso hacer algo que es solo de la cuenta de Zolea (15.7): cargar
 * el catálogo de servicios o dar de alta un balneario.
 *
 * <p>Es propia, y no un {@code AccessDeniedException}, porque el 403 tiene que llevar el motivo:
 * el genérico «No tenés permiso» no le dice al administrador quién lo hace ni dónde sí puede él.
 */
public class ZoleaAccountRequiredException extends RuntimeException {
    public ZoleaAccountRequiredException(String message) {
        super(message);
    }
}
