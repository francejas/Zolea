package com.zolea.backend.models;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.time.LocalDateTime;

/**
 * Un ingreso al balneario: una fila por cada validación exitosa (GH-76).
 *
 * <p>Hasta acá cada escaneo pisaba el anterior y del huésped quedaba solo su última entrada. Ahora
 * queda anotado cada ingreso, con la hora, quién lo validó y cómo. «Entró hoy» y el último ingreso
 * del huésped salen de acá: {@link Guest#recordEntry} es el único lugar que crea una fila.
 *
 * <p>{@code equals}, {@code hashCode} y {@code toString} se limitan al identificador, como en las
 * otras entidades (ver {@link Guest}).
 */
@Entity
@Data
@NoArgsConstructor
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@Table(name = "guest_entry", indexes = @Index(name = "idx_guest_entry_entered_at", columnList = "entered_at"))
public class GuestEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_guest", nullable = false)
    @ToString.Exclude
    private Guest guest;

    /** La reserva del huésped, guardada aparte para buscar los ingresos de una reserva sin pasar por él. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_booking", nullable = false)
    @ToString.Exclude
    private Booking booking;

    /** Cuándo entró, en la hora del balneario. */
    @Column(name = "entered_at", nullable = false)
    private LocalDateTime enteredAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private EntryMethod method;

    /** El administrador que validó. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_validated_by")
    @ToString.Exclude
    private Client validatedBy;

    GuestEntry(Guest guest, LocalDateTime enteredAt, EntryMethod method, Client validatedBy) {
        this.guest = guest;
        this.booking = guest.getBooking();
        this.enteredAt = enteredAt;
        this.method = method;
        this.validatedBy = validatedBy;
    }
}
