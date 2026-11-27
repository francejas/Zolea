package com.zolea.backend.security;

import com.zolea.backend.exceptions.client.ClientNotFoundException;
import org.springframework.stereotype.Component;

/**
 * Único punto donde vive la regla «esta cuenta es la de quien pide».
 *
 * <p>Se consulta desde las anotaciones de los endpoints con
 * {@code @clientAccess.isSelf(#id, principal.idClient)}. La cuenta de otra persona responde como
 * una que no existe (desde el 26/11): 404, con el mismo texto, aunque quien pide sea un
 * administrador. Antes era un 403.
 */
@Component("clientAccess")
public class ClientAccessPolicy {

    /**
     * Si es su propia cuenta. Si no, el 404 de «no existe», exista o no: el único id que alguien
     * puede pedir es el suyo, así que no hace falta mirar la base.
     */
    public boolean isSelf(Long idClient, Long ownIdClient) {
        if (idClient == null || !idClient.equals(ownIdClient)) {
            throw ClientNotFoundException.withId(idClient);
        }
        return true;
    }
}
