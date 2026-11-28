package com.zolea.backend.repositories;

/**
 * Una foto del balneario sin la imagen: lo que hace falta para listarla y ordenarla.
 *
 * @param idPhoto  la foto.
 * @param resortId el balneario.
 */
public record ResortPhotoRef(Long idPhoto, Long resortId) {
}
