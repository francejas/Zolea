package com.zolea.backend.exceptions.client;

/**
 * Un email, teléfono o DNI que ya es de otra cuenta, al editar el perfil (9.3).
 *
 * <p>Lleva el nombre del campo, igual que en {@code ClientRequest}, para que la respuesta lo diga
 * en {@code campos} y la pantalla lo marque debajo de ese campo.
 */
public class ClientDataTakenException extends RuntimeException {

    private final String field;

    public ClientDataTakenException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String getField() {
        return field;
    }
}
