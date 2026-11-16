package com.zolea.backend.repositories;

import com.zolea.backend.models.Booking;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface BookingRepository extends JpaRepository<Booking, Long> {

    // Las cuatro consultas de lectura declaran el mismo grafo: los huéspedes, el cliente y el
    // balneario al que se llega a través de la unidad, que es todo lo que necesita un
    // BookingResponse. Va repetido porque las anotaciones solo aceptan literales.
    //
    // Es UNA sola colección (guests) más relaciones "a uno". Agregar una segunda colección daría un
    // producto cartesiano, y Hibernate lo rechaza con MultipleBagFetchException.

    @Override
    @EntityGraph(attributePaths = {"guests", "client", "rentalUnit", "rentalUnit.resort"})
    List<Booking> findAll();

    @Override
    @EntityGraph(attributePaths = {"guests", "client", "rentalUnit", "rentalUnit.resort"})
    Optional<Booking> findById(Long id);
    /**
     * Verifica si una unidad de alquiler está disponible en un rango de fechas.
     * * ¿Cómo funciona la consulta?
     * 1. SELECT COUNT(b) = 0 : Busca en la base de datos y cuenta. Si el resultado es 0 (cero choques),
     * devuelve TRUE (está libre). Si encuentra 1 o más, devuelve FALSE (está ocupada).
     * * 2. Filtro 1 (La unidad): Solo busca reservas para la carpa o sombrilla específica solicitada.
     * * 3. Filtro 2 (El estado): Ignora las reservas que están canceladas (status != 'CANCELED'),
     * permitiendo que esa carpa vuelva a estar disponible en el sistema.
     * * 4. Filtro 3 (La superposición de fechas): Usa la fórmula matemática estándar para detectar choques:
     * (InicioViejo &lt;= FinNuevo) Y (FinViejo &gt;= InicioNuevo). Si ambas se cumplen, las fechas se pisan.
     * * Seguridad:
     * Los dos puntos (Ej: :idRentalUnit) son "Parámetros con Nombre" (Named Parameters).
     * Se usan en lugar de concatenar con "+" para prevenir ataques de inyección SQL (SQL Injection),
     * ya que Spring Boot sanitiza los valores automáticamente antes de enviarlos a MySQL.
     *
     * @param idRentalUnit ID de la unidad (carpa/sombrilla) que se quiere reservar.
     * @param startDate    Fecha de inicio deseada por el cliente.
     * @param endDate      Fecha de fin deseada por el cliente.
     * @return true si la unidad está libre, false si hay superposición de fechas.
     */
    

    @Query("SELECT COUNT(b) = 0 FROM Booking b " +
            "WHERE b.rentalUnit.idRentalUnit = :idRentalUnit " +
            "AND b.status != 'CANCELED' " +
            "AND (b.startDate <= :endDate AND b.endDate >= :startDate)")
    boolean isUnitAvailable(@Param("idRentalUnit") Long idRentalUnit,
                            @Param("startDate") LocalDate startDate,
                            @Param("endDate") LocalDate endDate);

    /**
     * Las unidades de un balneario que están ocupadas en un rango de fechas, cada una una sola vez.
     *
     * <p>Ocupada con la misma regla que {@link #isUnitAvailable}: una reserva que no está
     * cancelada —pendiente o confirmada— y se pisa con las fechas, contando los dos extremos. Es lo
     * que el plano necesita para no ofrecer una unidad que después falla al reservar.
     */
    @Query("SELECT DISTINCT b.rentalUnit.idRentalUnit FROM Booking b " +
            "WHERE b.rentalUnit.resort.idResort = :idResort " +
            "AND b.status != 'CANCELED' " +
            "AND (b.startDate <= :endDate AND b.endDate >= :startDate) " +
            "ORDER BY b.rentalUnit.idRentalUnit")
    List<Long> findOccupiedUnitIds(@Param("idResort") Long idResort,
                                   @Param("startDate") LocalDate startDate,
                                   @Param("endDate") LocalDate endDate);

    @EntityGraph(attributePaths = {"guests", "client", "rentalUnit", "rentalUnit.resort"})
    @Query("SELECT b FROM Booking b WHERE b.client.idClient = :clientId")
    List<Booking> findByClientId(@Param("clientId") Long clientId);

    /**
     * Las reservas de un balneario, alcanzadas a través de la unidad reservada.
     *
     * <p>La reserva no apunta al balneario: apunta a la unidad, y la unidad al balneario. Sin este
     * salto, el listado de reservas de un administrador devolvía las de los cinco balnearios.
     */
    @EntityGraph(attributePaths = {"guests", "client", "rentalUnit", "rentalUnit.resort"})
    @Query("SELECT b FROM Booking b WHERE b.rentalUnit.resort.idResort = :idResort")
    List<Booking> findByResortId(@Param("idResort") Long idResort);

    /**
     * Busca reservas que sigan PENDING y hayan sido creadas antes de la fecha límite: hace 75
     * minutos, el plazo de pago más el margen ({@code Booking.PAYMENT_WINDOW} y
     * {@code Booking.CLEANUP_GRACE}).
     */
    @Query("SELECT b FROM Booking b WHERE b.status = 'PENDING' AND b.createdAt <= :limitDate")
    List<Booking> findExpiredPendingBookings(@Param("limitDate") LocalDateTime limitDate);

    /**
     * Si la unidad tiene reservas por delante: pendientes o confirmadas que terminan {@code today} o
     * después. Es lo que impide darla de baja (RF32). Una cancelada no cuenta, y una que terminó
     * ayer ya es pasada.
     */
    @Query("SELECT COUNT(b) > 0 FROM Booking b "
            + "WHERE b.rentalUnit.idRentalUnit = :idRentalUnit "
            + "AND b.status IN ('PENDING', 'CONFIRMED') "
            + "AND b.endDate >= :today")
    boolean hasUpcomingBookings(@Param("idRentalUnit") Long idRentalUnit,
                                @Param("today") LocalDate today);

    /** Las reservas del balneario que siguen pendientes de pago. */
    @Query("SELECT COUNT(b) FROM Booking b WHERE b.rentalUnit.resort.idResort = :resortId AND b.status = 'PENDING'")
    long countPendingByResort(@Param("resortId") Long resortId);

    /**
     * Las reservas confirmadas de un balneario que tocan el rango, con sus huéspedes y su unidad
     * en la misma consulta: es lo que leen las estadísticas, en vez de todas las reservas del
     * sistema. La reserva llega al balneario a través de la unidad.
     */
    @EntityGraph(attributePaths = {"guests", "rentalUnit"})
    @Query("SELECT b FROM Booking b WHERE b.rentalUnit.resort.idResort = :resortId "
            + "AND b.status = 'CONFIRMED' AND b.startDate <= :to AND b.endDate >= :from")
    List<Booking> findConfirmedOverlappingRange(
            @Param("resortId") Long resortId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to
    );
}