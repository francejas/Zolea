package com.zolea.backend.dtos.rentalunit;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * El plano del balneario, de una vez (GH-68): la casilla de cada unidad. Las que no vienen quedan
 * donde estaban.
 */
public record PlanRequest(
        @Schema(description = "La casilla de cada unidad. Sin posX ni posY, la unidad sale del plano")
        @NotNull(message = "El plano tiene que traer la lista de unidades")
        List<@NotNull(message = "Cada unidad del plano tiene que traer su id") @Valid UnitPosition> units
) {

    /** Una unidad y su casilla: columna y fila, desde 0. Las dos vacías, fuera del plano. */
    public record UnitPosition(
            @Schema(description = "La unidad, que tiene que ser del balneario del administrador", example = "17")
            @NotNull(message = "Cada unidad del plano tiene que traer su id")
            Long idRentalUnit,

            @Schema(description = "Columna, de 0 a 39. Vacía junto con posY: fuera del plano", example = "3", nullable = true)
            Integer posX,

            @Schema(description = "Fila, de 0 a 39, con el mar arriba. Vacía junto con posX: fuera del plano", example = "1", nullable = true)
            Integer posY
    ) {
    }
}
