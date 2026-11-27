package com.zolea.backend.dtos.resort;

import com.zolea.backend.dtos.client.AdminAccountRequest;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * El alta de un balneario junto con su administrador, en un solo pedido (#71). Antes el balneario
 * se creaba solo, con un {@code adminEmail} suelto, y quedaba sin nadie que lo administrara.
 */
public record ResortRegistrationRequest(
        @Schema(description = "Nombre del balneario. No puede repetirse", example = "Balneario Pinamar Norte")
        @NotBlank(message = "Escribí el nombre del balneario.")
        String name,

        @Schema(description = "Dirección completa: calle y número, ciudad y provincia, como se buscaría en un mapa",
                example = "Av. Bunge 1200, Pinamar, Buenos Aires")
        @NotBlank(message = "Escribí la dirección.")
        String location,

        @Schema(description = "Foto de portada. Opcional", example = "https://ejemplo.com/portada.jpg")
        String coverPhotoUrl,

        @Schema(description = "Descripción para la pantalla pública. Opcional")
        String description,

        @Schema(description = "Los servicios que ofrece, por identificador. Opcional: los elige después su administrador")
        List<Long> amenityIds,

        @Schema(description = "La cuenta de su administrador. Se crea con este balneario asignado")
        @NotNull(message = "Faltan los datos del administrador.")
        @Valid
        AdminAccountRequest admin
) {
}
