package com.zolea.backend.models;

/** Quién canceló una reserva: el cliente, el balneario o el sistema, al vencer una pendiente. */
public enum CanceledBy {
    CLIENT,
    ADMIN,
    SYSTEM
}
