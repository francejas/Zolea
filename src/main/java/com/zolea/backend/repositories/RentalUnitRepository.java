package com.zolea.backend.repositories;

import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.UnitType;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface RentalUnitRepository extends JpaRepository<RentalUnit, Long> {

    /** Las unidades de un balneario. Es lo que acota el panel de cada administrador. */
    List<RentalUnit> findByResort_IdResort(Long idResort);

    /**
     * La unidad, tomando el candado de escritura sobre su fila hasta el final de la transacción.
     *
     * <p>Es lo que serializa las reservas sobre una misma unidad. Reservar es un
     * «consultar y después escribir»: se pregunta si está libre y luego se guarda. Sin candado, dos
     * peticiones simultáneas leen «libre» las dos y guardan las dos, y la unidad queda reservada dos
     * veces para las mismas fechas.
     *
     * <p><b>Por qué el candado va sobre la unidad y no sobre la reserva:</b> el conflicto es entre
     * dos filas de {@code booking} que todavía no existen, así que no hay ninguna fila común que
     * bloquear ni ninguna versión que comparar —un {@code @Version} en {@code Booking} no sirve—.
     * La unidad sí existe y es lo que las dos peticiones se disputan.
     *
     * <p>Una restricción {@code UNIQUE (id_rental_unit, start_date, end_date)} tampoco alcanzaría:
     * solo atraparía rangos idénticos, no dos rangos distintos que se pisan.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM RentalUnit u WHERE u.idRentalUnit = :id")
    Optional<RentalUnit> findByIdForUpdate(@Param("id") Long id);

    /**
     * Los balnearios activos que tienen lugar para una búsqueda, con cuántas unidades cumplen cada
     * uno. Un balneario sin ninguna unidad que cumpla no aparece.
     *
     * <p>Cuenta las unidades no bloqueadas que cumplen todos los filtros que vinieron. Un filtro en
     * {@code null} no restringe nada:
     * <ul>
     *   <li>{@code pattern}: el nombre o la ubicación del balneario, ya en minúsculas y con los
     *       comodines escapados con {@code !};</li>
     *   <li>{@code type} y {@code maxPrice}: el tipo de la unidad y su precio diario máximo,
     *       incluido;</li>
     *   <li>{@code amenityIds}: el balneario tiene <b>todos</b> esos servicios. Se cuentan los que
     *       tiene de la lista y se comparan con {@code amenityCount}, la cantidad de servicios
     *       distintos pedidos. Sin servicios, la lista va vacía y el conteo da 0 = 0;</li>
     *   <li>{@code from} y {@code to}: la unidad está libre en esas fechas.</li>
     * </ul>
     *
     * <p><b>Libre</b> se decide con la misma regla que {@link BookingRepository#isUnitAvailable},
     * que es la que aplica al reservar: no hay ninguna reserva que no esté cancelada y se pise con
     * las fechas, contando los dos extremos. Si la búsqueda y la reserva contaran distinto, la
     * portada ofrecería un lugar que después no se puede reservar.
     *
     * <p>Todo se resuelve en la base, en una consulta: las reservas no se traen a memoria para
     * filtrarlas.
     */
    @Query("SELECT new com.zolea.backend.repositories.ResortAvailability(r.idResort, COUNT(u)) "
            + "FROM RentalUnit u JOIN u.resort r "
            + "WHERE r.isActive = true "
            + "AND COALESCE(u.isBlocked, false) = false "
            + "AND (:pattern IS NULL "
            + "     OR LOWER(r.name) LIKE :pattern ESCAPE '!' "
            + "     OR LOWER(r.location) LIKE :pattern ESCAPE '!') "
            + "AND (:type IS NULL OR u.type = :type) "
            + "AND (:maxPrice IS NULL OR u.dailyPrice <= :maxPrice) "
            + "AND (SELECT COUNT(DISTINCT a.idAmenity) FROM Resort ra JOIN ra.amenities a "
            + "     WHERE ra.idResort = r.idResort AND a.idAmenity IN :amenityIds) = :amenityCount "
            + "AND (:from IS NULL OR NOT EXISTS ("
            + "     SELECT b.id FROM Booking b "
            + "     WHERE b.rentalUnit.idRentalUnit = u.idRentalUnit "
            + "     AND b.status != 'CANCELED' "
            + "     AND (b.startDate <= :to AND b.endDate >= :from))) "
            + "GROUP BY r.idResort "
            + "ORDER BY r.idResort")
    List<ResortAvailability> countMatchingUnitsByResort(@Param("pattern") String pattern,
                                                        @Param("type") UnitType type,
                                                        @Param("maxPrice") BigDecimal maxPrice,
                                                        @Param("amenityIds") Collection<Long> amenityIds,
                                                        @Param("amenityCount") long amenityCount,
                                                        @Param("from") LocalDate from,
                                                        @Param("to") LocalDate to);
}