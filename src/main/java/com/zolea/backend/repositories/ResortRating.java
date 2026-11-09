package com.zolea.backend.repositories;

/**
 * El promedio y la cantidad de reseñas de un balneario, tal como los cuenta la base.
 *
 * @param resortId el balneario.
 * @param average  el promedio de las calificaciones, sin redondear.
 * @param count    cuántas reseñas tiene.
 */
public record ResortRating(Long resortId, Double average, Long count) {
}
