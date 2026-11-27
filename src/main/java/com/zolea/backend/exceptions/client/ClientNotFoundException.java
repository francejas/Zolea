package com.zolea.backend.exceptions.client;

public class ClientNotFoundException extends RuntimeException  {
    public ClientNotFoundException(String message) {
        super(message);
    }

    /** La cuenta no existe, o es de otra persona: el mismo texto en los dos casos. */
    public static ClientNotFoundException withId(Long id) {
        return new ClientNotFoundException("Client with id " + id + " not found");
    }
}
