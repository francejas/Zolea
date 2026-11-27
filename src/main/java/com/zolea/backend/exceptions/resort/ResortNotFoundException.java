package com.zolea.backend.exceptions.resort;

public class ResortNotFoundException extends RuntimeException {
    public ResortNotFoundException(String message) {
        super(message);
    }

    /** El balneario no existe, o lo administra otro: el mismo texto en los dos casos. */
    public static ResortNotFoundException withId(Long id) {
        return new ResortNotFoundException("Resort with id " + id + " not found");
    }
}
