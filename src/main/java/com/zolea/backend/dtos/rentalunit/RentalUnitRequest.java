package com.zolea.backend.dtos.rentalunit;

import com.zolea.backend.models.UnitType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import io.swagger.v3.oas.annotations.media.Schema;

public record RentalUnitRequest(
        @Schema(description = "TENT para carpa, UMBRELLA para sombrilla", example = "TENT")
        @NotNull(message = "Hay que indicar si es carpa o sombrilla")
        UnitType type,

        @Schema(description = "Cómo se la llama en el balneario, en texto libre y de hasta 20 caracteres. No puede repetirse dentro del mismo balneario", example = "Carpa 12")
        @NotBlank(message = "La unidad necesita un identificador")
        @Size(max = 20, message = "El identificador puede tener hasta 20 caracteres")
        String identifier,

        @Schema(description = "Precio por día, con dos decimales", example = "12000.00")
        @NotNull(message = "El precio diario es obligatorio")
        @Positive(message = "El precio diario tiene que ser mayor que cero")
        BigDecimal dailyPrice,

        @Schema(description = "Una unidad bloqueada no se puede reservar, ni desde la web ni desde acá", example = "false")
        Boolean isBlocked,

        @Schema(description = "El balneario al que pertenece. Tiene que ser el del administrador que hace el pedido", example = "1")
        @NotNull(message = "Hay que indicar a qué balneario pertenece")
        @Positive(message = "El identificador del balneario no es válido")
        Long resortId
) {
}
