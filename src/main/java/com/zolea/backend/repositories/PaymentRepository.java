package com.zolea.backend.repositories;

import com.zolea.backend.models.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, Long> {

    /** Si ya registramos este pago. Es la comprobación previa; la garantía es el índice único. */
    Optional<Payment> findByGatewayPaymentId(String gatewayPaymentId);

    boolean existsByGatewayPaymentId(String gatewayPaymentId);

    /**
     * Los cobros de esas reservas, en una sola consulta para todo un listado, el más nuevo primero.
     *
     * <p>«Más nuevo» es por cuándo lo aprobó la pasarela y, si no lo informó, por cuándo nos
     * enteramos: {@code paidAt} puede venir vacío y {@code recordedAt} no.
     */
    @Query("SELECT p FROM Payment p WHERE p.booking.id IN :bookingIds "
            + "ORDER BY COALESCE(p.paidAt, p.recordedAt) DESC, p.idPayment DESC")
    List<Payment> findByBookingIdsNewestFirst(@Param("bookingIds") Collection<Long> bookingIds);
}
