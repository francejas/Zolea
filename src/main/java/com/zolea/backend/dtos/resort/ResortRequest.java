package com.zolea.backend.dtos.resort;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import java.util.List;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Datos de un balneario.
 *
 * <p>La foto de portada, la descripción y las amenidades son opcionales, y cuando no vienen el
 * servicio <b>conserva</b> lo que ya estaba. Antes las pisaba con null: un formulario que no
 * mandara la foto dejaba la portada pública sin imagen.
 *
 * <p>La excepción es {@code PUT /api/resorts/my} (Mi balneario, 12.5): su formulario manda todo,
 * así que una descripción o una foto vacías son las que el administrador borró, y se borran.
 */
public record ResortRequest(
        @Schema(description = "Nombre del balneario", example = "Balneario Playa Grande")
        @NotBlank(message = "El nombre del balneario es obligatorio")
        String name,

        @Schema(description = "Dirección completa: calle y número, ciudad y provincia, como se buscaría en un mapa. "
                + "El botón «Cómo llegar» la usa para abrir Google Maps",
                example = "Av. Patricio Peralta Ramos 4800, Mar del Plata, Buenos Aires")
        @NotBlank(message = "La ubicación es obligatoria")
        String location,

        @Schema(description = "Email del administrador del balneario. Al editar «mi balneario» no se toca: cambiarlo sería cambiar de dueño", example = "admin.mdp@zolea.com")
        @Email(message = "El email del administrador no tiene un formato válido")
        String adminEmail,

        @Schema(description = "Foto de portada. Si no viene en un PUT, se conserva la que estaba, salvo en /my, donde vacía se borra", example = "https://ejemplo.com/portada.jpg")
        String coverPhotoUrl,
        @Schema(description = "Descripción para la pantalla pública. Si no viene en un PUT, se conserva la que estaba, salvo en /my, donde vacía se borra", example = "Balneario con carpas, sombrillas y parador.")
        String description,
        @Schema(description = "Los servicios que ofrece, por identificador")
        List<Long> amenityIds
) {
}
