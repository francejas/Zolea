package com.zolea.backend.dtos.resort;

import com.zolea.backend.models.UnitType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;

/**
 * Los filtros de {@code GET /api/resorts}. Todos son opcionales, y uno en {@code null} no
 * restringe nada.
 *
 * @param q          el nombre o la ubicación del balneario, sin distinguir mayúsculas.
 * @param from       el primer día buscado. Va con {@code to}, o ninguna de las dos.
 * @param to         el último día buscado, incluido.
 * @param type       el tipo de unidad.
 * @param maxPrice   el precio diario máximo, incluido.
 * @param amenityIds los servicios que el balneario tiene que tener, todos.
 */
public record ResortSearch(
        String q,
        LocalDate from,
        LocalDate to,
        UnitType type,
        BigDecimal maxPrice,
        List<Long> amenityIds
) {

    /**
     * Un texto en blanco cuenta como que no vino —{@code ?q=} es lo que manda un buscador que se
     * dejó vacío—, y los servicios quedan sin repetidos ni vacíos: {@code amenityIds=1,,1} pide
     * un solo servicio, no tres.
     */
    public ResortSearch {
        q = (q == null || q.isBlank()) ? null : q.strip();
        amenityIds = (amenityIds == null) ? List.of()
                : amenityIds.stream().filter(Objects::nonNull).distinct().toList();
    }

    /** Si no vino ningún filtro. */
    public boolean isEmpty() {
        return q == null && from == null && to == null && type == null && maxPrice == null
                && amenityIds.isEmpty();
    }

    public boolean hasDates() {
        return from != null && to != null;
    }
}
