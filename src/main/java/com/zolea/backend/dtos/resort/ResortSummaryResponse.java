package com.zolea.backend.dtos.resort;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Una fila de la lista de balnearios de la cuenta de Zolea (#71): activos e inactivos, con su
 * administrador y cuántas unidades tiene.
 */
public record ResortSummaryResponse(
        Long idResort,
        String name,
        String location,
        boolean active,
        @Schema(description = "Las unidades del balneario, sin las dadas de baja", example = "38")
        long unitCount,
        @Schema(description = "Su administrador. Null si todavía no tiene uno")
        ResortAdminResponse admin
) {

    /** El administrador de un balneario, lo justo para la lista. */
    public record ResortAdminResponse(
            Long idClient,
            String firstName,
            String lastName,
            String email
    ) {
    }
}
