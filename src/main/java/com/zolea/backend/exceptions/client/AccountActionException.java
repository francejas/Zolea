package com.zolea.backend.exceptions.client;

/**
 * Una acción sobre una cuenta que no se puede hacer (#72): la cuenta de Zolea desactivándose o
 * cambiándose el rol, o quitarle el balneario a quien no tiene. Responde 400 con el motivo.
 */
public class AccountActionException extends RuntimeException {
    public AccountActionException(String message) {
        super(message);
    }
}
