package com.zolea.backend.exceptions.resort;

/** Una foto que no se puede subir o un orden que no sirve: 400, con el motivo. */
public class InvalidResortPhotoException extends RuntimeException {
    public InvalidResortPhotoException(String message) {
        super(message);
    }
}
