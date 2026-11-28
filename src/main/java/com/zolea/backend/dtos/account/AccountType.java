package com.zolea.backend.dtos.account;

import com.zolea.backend.models.Client;

/**
 * El tipo de una cuenta, como lo ve la cuenta de Zolea (#72). En la base no es una columna: sale del
 * rol y del balneario asignado.
 */
public enum AccountType {
    /** Un cliente: rol USER. */
    CLIENT,
    /** El administrador de un balneario: rol ADMIN, con balneario asignado. */
    RESORT_ADMIN,
    /** La cuenta de Zolea: rol ADMIN, sin balneario. */
    ZOLEA;

    public static AccountType of(Client client) {
        if (!"ADMIN".equals(client.getRole())) return CLIENT;
        return client.getManagedResort() != null ? RESORT_ADMIN : ZOLEA;
    }
}
