package com.zolea.backend.repositories;

/**
 * Cuántas unidades de un balneario cumplen una búsqueda, tal como las cuenta la base.
 *
 * @param resortId el balneario.
 * @param units    cuántas de sus unidades no están bloqueadas, cumplen el tipo y el precio y, si
 *                 se buscó con fechas, están libres en esas fechas.
 */
public record ResortAvailability(Long resortId, Long units) {
}
