package com.zolea.backend.dtos.account;

import com.zolea.backend.models.Client;
import io.swagger.v3.oas.annotations.media.Schema;

/** Una fila de la lista de usuarios de la cuenta de Zolea (#72). */
public record AccountSummaryResponse(
        Long idClient,
        String firstName,
        String lastName,
        String email,
        String dni,
        AccountType type,
        @Schema(description = "Si puede ingresar")
        boolean active,
        @Schema(description = "El balneario que administra. Null si no administra ninguno")
        ManagedResortResponse managedResort
) {

    public static AccountSummaryResponse of(Client client) {
        return new AccountSummaryResponse(client.getIdClient(), client.getFirstName(), client.getLastName(),
                client.getEmail(), client.getDni(), AccountType.of(client), client.isActive(),
                ManagedResortResponse.of(client.getManagedResort()));
    }
}
