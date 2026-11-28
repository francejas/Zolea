package com.zolea.backend.dtos.resort;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/** El orden nuevo de las fotos del balneario: todas, cada una una vez. La primera es la portada. */
public record PhotoOrderRequest(
        @Schema(description = "Los ids de todas las fotos del balneario, en el orden nuevo", example = "[12, 10, 11]")
        @NotNull(message = "Van los ids de las fotos en el orden nuevo.")
        List<Long> photoIds
) {
}
