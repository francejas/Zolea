package com.zolea.backend.repositories;

import com.zolea.backend.models.GuestEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface GuestEntryRepository extends JpaRepository<GuestEntry, Long> {

    /** Los ingresos de una reserva, del más nuevo al más viejo, con el huésped y la unidad en la misma consulta. */
    @Query("SELECT e FROM GuestEntry e JOIN FETCH e.guest JOIN FETCH e.booking b JOIN FETCH b.rentalUnit"
            + " WHERE b.id = :bookingId ORDER BY e.enteredAt DESC, e.id DESC")
    List<GuestEntry> findByBooking(@Param("bookingId") Long bookingId);

    /** Los ingresos de un balneario en [from, to), del más nuevo al más viejo. */
    @Query("SELECT e FROM GuestEntry e JOIN FETCH e.guest JOIN FETCH e.booking b JOIN FETCH b.rentalUnit u"
            + " WHERE u.resort.idResort = :resortId AND e.enteredAt >= :from AND e.enteredAt < :to"
            + " ORDER BY e.enteredAt DESC, e.id DESC")
    List<GuestEntry> findByResortBetween(@Param("resortId") Long resortId,
                                         @Param("from") LocalDateTime from,
                                         @Param("to") LocalDateTime to);
}
