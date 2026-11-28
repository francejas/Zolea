package com.zolea.backend.exceptions.resort;

public class ResortPhotoNotFoundException extends RuntimeException {
    public ResortPhotoNotFoundException(String message) {
        super(message);
    }

    /** La foto no existe, o es de otro balneario: el mismo texto en los dos casos. */
    public static ResortPhotoNotFoundException withId(Long id) {
        return new ResortPhotoNotFoundException("Foto no encontrada con el ID: " + id);
    }
}
