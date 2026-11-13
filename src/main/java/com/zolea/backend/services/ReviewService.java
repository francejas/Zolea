package com.zolea.backend.services;

import com.zolea.backend.dtos.review.ReviewRequest;
import com.zolea.backend.dtos.review.ReviewResponse;
import com.zolea.backend.exceptions.booking.BookingNotFoundException;
import com.zolea.backend.exceptions.booking.BookingStateException;
import com.zolea.backend.exceptions.resort.ResortNotFoundException;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Review;
import com.zolea.backend.repositories.BookingRepository;
import com.zolea.backend.repositories.ResortRepository;
import com.zolea.backend.repositories.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Las reseñas, el primero de los requisitos del TFI: una por reserva, de 1 a 5 y con un comentario
 * opcional. Que el que califica sea un cliente y el dueño de la reserva lo comprueba el endpoint,
 * con {@code hasRole('USER')} y {@code @bookingAccess}.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ReviewService {

    private static final String ALREADY_REVIEWED = "Ya calificaste esta reserva.";

    private final ReviewRepository reviewRepository;
    private final BookingRepository bookingRepository;
    private final ResortRepository resortRepository;
    private final Clock clock;

    /**
     * Califica una reserva.
     *
     * @throws BookingNotFoundException si la reserva no existe.
     * @throws BookingStateException    si ya se calificó, o si no está confirmada o su estadía
     *                                  todavía no terminó.
     */
    @Transactional
    public ReviewResponse review(Long bookingId, ReviewRequest request) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new BookingNotFoundException(
                        "Reserva no encontrada con el ID: " + bookingId));

        // Primero esta: una reserva ya calificada también terminó, y el motivo que importa es otro.
        if (reviewRepository.existsByBooking_Id(bookingId)) {
            throw new BookingStateException(ALREADY_REVIEWED);
        }
        if (!booking.canBeReviewed(LocalDate.now(clock))) {
            throw new BookingStateException("Vas a poder calificar cuando termine tu estadía.");
        }

        Review review = new Review();
        review.setBooking(booking);
        review.setRating(request.rating());
        review.setComment(blankToNull(request.comment()));
        review.setCreatedAt(LocalDateTime.now(clock));
        try {
            // saveAndFlush para que la restricción de la base salte acá y no al cerrar la transacción.
            return ReviewResponse.of(reviewRepository.saveAndFlush(review));
        } catch (DataIntegrityViolationException ex) {
            // Dos pedidos a la vez pasan los dos el chequeo de arriba; uk_resena_de_reserva frena al
            // segundo, que recibe el mismo motivo que si hubiera llegado después.
            throw new BookingStateException(ALREADY_REVIEWED);
        }
    }

    /**
     * Las reseñas de un balneario, de la más nueva a la más vieja.
     *
     * @throws ResortNotFoundException si el balneario no existe: una lista vacía diría «todavía no
     *                                 tiene reseñas», que es otra cosa.
     */
    public List<ReviewResponse> getByResort(Long resortId) {
        if (!resortRepository.existsById(resortId)) {
            throw new ResortNotFoundException("No existe un balneario con el ID: " + resortId);
        }
        return reviewRepository.findByResortNewestFirst(resortId).stream()
                .map(ReviewResponse::of)
                .toList();
    }

    /** Un comentario en blanco es que no dejó comentario. */
    private static String blankToNull(String comment) {
        return comment == null || comment.isBlank() ? null : comment.strip();
    }
}
