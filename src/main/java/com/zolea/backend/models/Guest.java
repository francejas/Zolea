package com.zolea.backend.models;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * <p><b>Sobre {@code equals}, {@code hashCode} y {@code toString}:</b> los tres se limitan al
 * identificador. {@code @Data} de Lombok los genera con <b>todos</b> los campos, y sobre relaciones
 * que apuntan en los dos sentidos eso es una recursión infinita — imprimir una entidad tiraba la
 * aplicación con {@code StackOverflowError}. La identidad de una entidad es su fila, no el
 * contenido de sus campos.
 *
 * <p>Queda una limitación conocida: el identificador lo asigna la base al guardar, así que el
 * {@code hashCode} de una entidad cambia entre antes y después de persistirla. Por eso una entidad
 * sin guardar no debe meterse en un {@code HashSet} ni usarse como clave de un {@code HashMap}.
 */
@Entity
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class Guest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long idGuest;

    //cambiar a firstname y lastname
    private String fullName;

    private String dni;

    @Column(unique = true)
    private String qrToken;

    /**
     * Cuándo entró por última vez, en la hora del balneario; {@code null} si nunca entró.
     *
     * <p>Hasta la 15.6 era un {@code isEntryValidated}: el código servía una sola vez. Ahora sirve
     * para entrar todas las veces que haga falta durante la estadía, así que lo que importa es
     * cuándo fue el último ingreso.
     *
     * <p>Desde GH-76 es el resumen del registro de ingresos: lo escribe solo {@link #recordEntry}.
     */
    private LocalDateTime lastEntryAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_booking")
    @ToString.Exclude
    private Booking booking;

    /**
     * Anota un ingreso: el registro nuevo y, en el huésped, cuándo fue el último.
     *
     * <p>Desde GH-76 cada ingreso queda en {@link GuestEntry}; {@code lastEntryAt} es el resumen del
     * último, que se actualiza solo acá para que no se separe del registro.
     *
     * @return el registro, para guardarlo
     */
    public GuestEntry recordEntry(LocalDateTime at, EntryMethod method, Client validatedBy) {
        this.lastEntryAt = at;
        return new GuestEntry(this, at, method, validatedBy);
    }

    /** Si entró ese día: es lo que la reserva informa como {@code isEntryValidated}. */
    public boolean enteredOn(LocalDate day) {
        return lastEntryAt != null && lastEntryAt.toLocalDate().equals(day);
    }
}