package com.zolea.backend.dtos.resort;

import com.zolea.backend.dtos.amenity.AmenityResponse;
import com.zolea.backend.dtos.rentalunit.RentalUnitResponse;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.util.List;

/**
 * Un balneario, como lo ve cualquiera.
 *
 * <p>El {@code adminEmail} se quitó a propósito: {@code GET /api/resorts} es público y publicaba
 * el email de cada administrador, que es además el usuario con el que inicia sesión.
 *
 * <p>{@code active} sí se expone: los endpoints para activar y desactivar un balneario existían,
 * pero el estado no se podía leer desde ningún lado, así que el panel del administrador no tenía
 * cómo mostrar en qué estado había quedado.
 */
public record ResortResponse(
        Long idResort,
        String name,
        String location,
        String coverPhotoUrl,
        String description,
        boolean active,
        List<AmenityResponse> amenities,
        List<RentalUnitResponse> rentalUnits,
        @Schema(description = "El promedio de las reseñas, con un decimal. Null si todavía no tiene", example = "4.5")
        BigDecimal averageRating,
        @Schema(description = "Cuántas reseñas tiene", example = "12")
        long reviewCount
) {
}
