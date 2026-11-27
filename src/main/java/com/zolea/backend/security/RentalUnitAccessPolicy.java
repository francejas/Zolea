package com.zolea.backend.security;

import com.zolea.backend.exceptions.rentalunit.RentalUnitNotFoundException;
import com.zolea.backend.repositories.RentalUnitRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Único punto donde vive la regla «esta unidad es del balneario de este administrador».
 *
 * <p>Se consulta desde las anotaciones de los endpoints con
 * {@code @unitAccess.belongsToResort(#id, principal.idManagedResort)}. Antes no existía: cualquier
 * administrador podía bloquear o re-preciar cualquiera de las cien unidades del sistema, porque
 * ninguna operación miraba de qué balneario era la unidad.
 */
@Component("unitAccess")
@RequiredArgsConstructor
public class RentalUnitAccessPolicy {

    private final RentalUnitRepository rentalUnitRepository;

    /**
     * Si esa unidad pertenece a ese balneario.
     *
     * <p>Sigue el criterio de {@link BookingAccessPolicy}: una unidad de otro balneario responde
     * como una que no existe, con el mismo 404 y el mismo texto; una que no existe pasa, para que
     * el endpoint devuelva su 404. Un administrador sin balneario asignado ({@code idResort} nulo)
     * no alcanza ninguna: 403.
     */
    @Transactional(readOnly = true)
    public boolean belongsToResort(Long idRentalUnit, Long idResort) {
        if (idRentalUnit == null || idResort == null) {
            return false;
        }
        boolean ofAnotherResort = rentalUnitRepository.findById(idRentalUnit)
                .map(unit -> unit.getResort() == null || !idResort.equals(unit.getResort().getIdResort()))
                .orElse(false); // no existe: que el endpoint devuelva su 404
        if (ofAnotherResort) {
            throw RentalUnitNotFoundException.withId(idRentalUnit);
        }
        return true;
    }
}
