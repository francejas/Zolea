package com.zolea.backend.models;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

import java.time.LocalDateTime;

/**
 * La calificación que deja el cliente sobre el balneario donde estuvo, el primero de los requisitos
 * del TFI.
 *
 * <p><b>Una reseña por reserva</b>, y la reserva es lo que la ata al balneario (a través de la
 * unidad) y al cliente. Que sea una sola lo garantiza el índice único sobre la reserva: el servicio
 * lo comprueba antes para responder con un mensaje claro, pero si dos pedidos llegan a la vez, el
 * segundo no entra.
 *
 * <p>Quién puede calificar es una regla de la reserva: {@link Booking#canBeReviewed}.
 */
@Table(name = "review", uniqueConstraints =
        @UniqueConstraint(name = "uk_resena_de_reserva", columnNames = "id_booking"))
@Entity
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class Review {

    /** El comentario es opcional y tiene hasta estos caracteres. */
    public static final int MAX_COMMENT = 500;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long idReview;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_booking", nullable = false)
    @ToString.Exclude
    private Booking booking;

    /** De 1 a 5. */
    @Column(nullable = false)
    private Integer rating;

    @Column(length = MAX_COMMENT)
    private String comment;

    /** Cuándo se calificó. Sale del reloj inyectado, no del reloj de la máquina. */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
