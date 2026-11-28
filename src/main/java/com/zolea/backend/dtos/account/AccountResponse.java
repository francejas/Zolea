package com.zolea.backend.dtos.account;

import com.zolea.backend.models.Client;
import io.swagger.v3.oas.annotations.media.Schema;

/** Una cuenta vista por la cuenta de Zolea (#72): sus datos, su balneario y cuántas reservas tiene. */
public record AccountResponse(
        Long idClient,
        String firstName,
        String lastName,
        String email,
        String phone,
        String dni,
        AccountType type,
        @Schema(description = "Si puede ingresar")
        boolean active,
        @Schema(description = "El balneario que administra. Null si no administra ninguno")
        ManagedResortResponse managedResort,
        @Schema(description = "Las reservas que hizo, de cualquier estado", example = "4")
        int bookingCount
) {

    public static AccountResponse of(Client client) {
        return new AccountResponse(client.getIdClient(), client.getFirstName(), client.getLastName(),
                client.getEmail(), client.getPhone(), client.getDni(), AccountType.of(client), client.isActive(),
                ManagedResortResponse.of(client.getManagedResort()),
                client.getBookings() == null ? 0 : client.getBookings().size());
    }
}
