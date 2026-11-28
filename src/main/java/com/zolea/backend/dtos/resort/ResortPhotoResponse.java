package com.zolea.backend.dtos.resort;

import io.swagger.v3.oas.annotations.media.Schema;

/** Una foto del balneario: su id y la dirección pública donde se ve. */
public record ResortPhotoResponse(
        @Schema(description = "El id de la foto: es el que se usa para borrarla y para ordenarlas", example = "12")
        Long idPhoto,
        @Schema(description = "Dónde se ve la foto, sin sesión", example = "http://localhost:8080/api/resorts/1/photos/12")
        String url
) {
}
