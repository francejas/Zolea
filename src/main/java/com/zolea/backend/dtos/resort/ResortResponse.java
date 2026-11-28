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
 *
 * <p>{@code availableUnits} solo tiene valor en una búsqueda con fechas: es lo que la portada
 * muestra como «3 lugares libres». Sin fechas no hay contra qué contar, y es {@code null} y no un
 * número, igual que el promedio sin reseñas.
 *
 * <p>{@code photos} son las fotos que el administrador subió (GH-67), y la primera es la portada.
 * Sin fotos, {@code coverPhotoUrl} sigue siendo la dirección que el balneario ya tenía.
 */
public record ResortResponse(
        Long idResort,
        String name,
        String location,
        @Schema(description = "La portada: la primera de las fotos subidas o, si no tiene ninguna, la dirección "
                + "que el balneario tenía cargada. Null si no tiene ninguna de las dos",
                example = "http://localhost:8080/api/resorts/1/photos/12")
        String coverPhotoUrl,
        @Schema(description = "Las fotos subidas desde Mi balneario, en el orden elegido. Vacía si no tiene")
        List<ResortPhotoResponse> photos,
        String description,
        boolean active,
        List<AmenityResponse> amenities,
        List<RentalUnitResponse> rentalUnits,
        @Schema(description = "El promedio de las reseñas, con un decimal. Null si todavía no tiene", example = "4.5")
        BigDecimal averageRating,
        @Schema(description = "Cuántas reseñas tiene", example = "12")
        long reviewCount,
        @Schema(description = "Cuántas unidades cumplen la búsqueda y están libres en las fechas buscadas. "
                + "Null cuando no se buscó con fechas", example = "3")
        Long availableUnits
) {
}
