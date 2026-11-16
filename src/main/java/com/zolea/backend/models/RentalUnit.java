package com.zolea.backend.models;

import com.zolea.backend.exceptions.rentalunit.RentalUnitRetiredException;
import jakarta.persistence.*;

import java.math.BigDecimal;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

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
// Dos unidades del mismo balneario no pueden compartir identificador. Entre balnearios sí: la
// carpa "A-1" de Mar del Plata y la "A-1" de Pinamar son unidades distintas.
@Table(name = "rental_unit", uniqueConstraints =
        @UniqueConstraint(name = "uk_unidad_por_balneario", columnNames = {"id_resort", "identifier"}))
@Entity
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class RentalUnit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long idRentalUnit;

    @Enumerated(EnumType.STRING)
    private UnitType type;

    private String identifier;

    @Column(precision = 12, scale = 2)
    private BigDecimal dailyPrice;

    private Boolean isBlocked;

    /**
     * Si la unidad se dio de baja (RF32). Es definitivo y distinto del bloqueo, que es temporal: una
     * unidad dada de baja no se ofrece ni se reserva, pero la fila queda para que sus reservas pasadas
     * sigan apuntando a algo y su identificador siga ocupado.
     *
     * <p>El valor por defecto va en la columna para que las filas que ya existían, y los
     * {@code INSERT} de la demostración que no la nombran, queden como unidades en servicio.
     */
    @Column(nullable = false, columnDefinition = "BOOLEAN NOT NULL DEFAULT FALSE")
    private boolean retired;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_resort")
    @ToString.Exclude
    private Resort resort;

    /**
     * Rechaza cualquier cambio sobre una unidad dada de baja: bloquearla, desbloquearla o cambiarle
     * el precio no tiene sentido para algo que ya no se ofrece.
     */
    public void requireInService() {
        if (retired) {
            throw new RentalUnitRetiredException(
                    "La unidad " + identifier + " está dada de baja.");
        }
    }
}