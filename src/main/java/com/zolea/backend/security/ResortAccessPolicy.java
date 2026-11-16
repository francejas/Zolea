package com.zolea.backend.security;

import com.zolea.backend.repositories.ResortRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Único punto donde vive la regla «este balneario es el de este administrador».
 *
 * <p>Se consulta desde las anotaciones de los endpoints con
 * {@code @resortAccess.isManagedBy(#id, principal.idManagedResort)}. Hasta la 15.5 editar,
 * desactivar y reactivar un balneario por id solo pedía rol ADMIN: el administrador de Mar del
 * Plata podía sacar de la portada a Ocean View Resort (RNF03).
 */
@Component("resortAccess")
@RequiredArgsConstructor
public class ResortAccessPolicy {

    private final ResortRepository resortRepository;

    /**
     * Si ese balneario es el que administra. Sigue el criterio de {@link BookingAccessPolicy#canAccess}:
     * un balneario que no existe pasa, para que el endpoint devuelva su 404. Un administrador sin
     * balneario asignado no alcanza ninguno.
     */
    @Transactional(readOnly = true)
    public boolean isManagedBy(Long idResort, Long idManagedResort) {
        if (idResort == null || idManagedResort == null) {
            return false;
        }
        return idManagedResort.equals(idResort) || !resortRepository.existsById(idResort);
    }
}
