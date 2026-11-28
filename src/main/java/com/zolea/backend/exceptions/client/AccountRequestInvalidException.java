package com.zolea.backend.exceptions.client;

import java.util.Map;

/**
 * Un pedido de la cuenta de Zolea sobre una cuenta, con datos inválidos (#72). Se valida a mano,
 * después de mirar que sea la cuenta de Zolea, como el alta de un balneario: así quien no puede
 * recibe el 403 y no un 400 que hable de los datos. Responde 400 con {@code campos}.
 */
public class AccountRequestInvalidException extends RuntimeException {

    private final Map<String, String> fields;

    public AccountRequestInvalidException(Map<String, String> fields) {
        super("Hay datos inválidos en el pedido");
        this.fields = fields;
    }

    public Map<String, String> getFields() {
        return fields;
    }
}
