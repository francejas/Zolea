package com.zolea.backend.exceptions.amenity;

/**
 * Un administrador con balneario quiso crear, renombrar o borrar un servicio del catálogo. Eso lo
 * hace solo la cuenta de Zolea (15.7); cada balneario elige los suyos en Mi balneario.
 *
 * <p>Es propia, y no un {@code AccessDeniedException}, porque el 403 tiene que llevar el motivo:
 * el genérico «No tenés permiso» no le dice al administrador dónde sí puede elegir sus servicios.
 */
public class AmenityCatalogForbiddenException extends RuntimeException {
    public AmenityCatalogForbiddenException(String message) {
        super(message);
    }
}
