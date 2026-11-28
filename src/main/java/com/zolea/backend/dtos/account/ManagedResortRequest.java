package com.zolea.backend.dtos.account;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** El balneario que se le asigna a una cuenta (#72). */
public record ManagedResortRequest(
        @Schema(description = "El balneario que va a administrar", example = "1")
        @NotNull(message = "Elegí un balneario.")
        Long idResort
) {
}
