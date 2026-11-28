package com.zolea.backend.security;

import com.zolea.backend.exceptions.resort.ResortNotFoundException;
import org.springframework.stereotype.Component;

/**
 * Único punto donde vive la regla «este balneario es el de este administrador».
 *
 * <p>Se consulta desde las anotaciones de los endpoints con
 * {@code @resortAccess.isManagedBy(#id, principal.idManagedResort)}. Hasta la 15.5 editar,
 * desactivar y reactivar un balneario por id solo pedía rol ADMIN: el administrador de Mar del
 * Plata podía sacar de la portada a Ocean View Resort (RNF03).
 */
@Component("resortAccess")
public class ResortAccessPolicy {

    /**
     * Si ese balneario es el que administra. Si no, responde como si no existiera: el mismo 404 y el
     * mismo texto, exista o no (desde el 26/11; antes, uno ajeno daba 403). No hace falta mirar la
     * base: el único que puede tocar es el suyo. Un administrador sin balneario asignado no alcanza
     * ninguno: 403.
     */
    public boolean isManagedBy(Long idResort, Long idManagedResort) {
        if (idResort == null || idManagedResort == null) {
            return false;
        }
        if (!idManagedResort.equals(idResort)) {
            throw ResortNotFoundException.withId(idResort);
        }
        return true;
    }

    /**
     * Como {@link #isManagedBy}, pero la cuenta de Zolea (un administrador sin balneario) alcanza
     * cualquiera: desactiva y reactiva balnearios desde su lista (#71). Si el balneario no existe,
     * el 404 lo da el servicio.
     */
    public boolean isManagedByOrZolea(Long idResort, Long idManagedResort) {
        if (idResort == null) {
            return false;
        }
        return idManagedResort == null || isManagedBy(idResort, idManagedResort);
    }
}
