package com.zolea.backend.dtos.account;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

/** La contraseña provisoria que la cuenta de Zolea le pone a una cuenta (#72). */
public record AccountPasswordRequest(
        @Schema(description = "Contraseña provisoria. La persona la cambia en Mi cuenta", example = "provisoria1")
        @NotBlank(message = "Escribí una contraseña provisoria.")
        String password
) {
}
