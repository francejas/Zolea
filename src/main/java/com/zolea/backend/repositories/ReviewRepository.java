package com.zolea.backend.repositories;

import com.zolea.backend.models.Review;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface ReviewRepository extends JpaRepository<Review, Long> {

    /** Si la reserva ya se calificó. Es la comprobación previa; la garantía es el índice único. */
    boolean existsByBooking_Id(Long bookingId);

    /**
     * Cuáles de esas reservas ya se calificaron. Es una sola consulta para todo un listado: con
     * {@link #existsByBooking_Id} por cada reserva, Mis reservas volvía a ser un N+1.
     */
    @Query("SELECT r.booking.id FROM Review r WHERE r.booking.id IN :bookingIds")
    List<Long> findReviewedBookingIds(@Param("bookingIds") Collection<Long> bookingIds);

    /**
     * Las reseñas de un balneario, de la más nueva a la más vieja, con el cliente de cada una: es
     * de donde sale el autor. La reseña llega al balneario a través de la reserva y la unidad.
     */
    @Query("SELECT r FROM Review r JOIN FETCH r.booking b JOIN FETCH b.client "
            + "WHERE b.rentalUnit.resort.idResort = :resortId "
            + "ORDER BY r.createdAt DESC, r.idReview DESC")
    List<Review> findByResortNewestFirst(@Param("resortId") Long resortId);

    /**
     * El promedio y la cantidad de reseñas de cada uno de esos balnearios, en una sola consulta. Un
     * balneario sin reseñas no aparece.
     */
    @Query("SELECT new com.zolea.backend.repositories.ResortRating("
            + "u.resort.idResort, AVG(r.rating), COUNT(r)) "
            + "FROM Review r JOIN r.booking b JOIN b.rentalUnit u "
            + "WHERE u.resort.idResort IN :resortIds GROUP BY u.resort.idResort")
    List<ResortRating> findRatingsByResort(@Param("resortIds") Collection<Long> resortIds);
}
