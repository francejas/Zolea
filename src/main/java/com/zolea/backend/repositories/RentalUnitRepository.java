package com.zolea.backend.repositories;

import com.zolea.backend.models.RentalUnit;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

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

    @Query("SELECT COUNT(u) FROM RentalUnit u WHERE u.resort.id = :resortId AND u.status != 'BLOCKED'")
    long countActiveUnitsByResort(@Param("resortId") Long resortId);
}