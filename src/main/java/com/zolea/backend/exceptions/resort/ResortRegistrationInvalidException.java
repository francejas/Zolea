package com.zolea.backend.exceptions.resort;

import java.util.Map;

/**
 * Un alta de balneario con datos inválidos (#71). Se valida a mano, después de mirar que sea la
 * cuenta de Zolea: así el administrador de un balneario recibe el 403 y no un 400 que hable de los
 * datos. Responde como cualquier error de validación: 400 con {@code campos}.
 */
public class ResortRegistrationInvalidException extends RuntimeException {

    private final Map<String, String> fields;

    public ResortRegistrationInvalidException(Map<String, String> fields) {
        super("Hay datos inválidos en el pedido");
        this.fields = fields;
    }

    public Map<String, String> getFields() {
        return fields;
    }
}
