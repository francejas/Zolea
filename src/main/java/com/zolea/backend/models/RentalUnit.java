package com.zolea.backend.models;

import com.zolea.backend.exceptions.rentalunit.InvalidPlanException;
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

    /** El plano es una grilla de hasta 40 columnas por 40 filas (GH-68). */
    public static final int PLAN_SIZE = 40;

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

    /**
     * La casilla de la unidad en el plano del balneario: columna ({@code posX}) y fila
     * ({@code posY}), desde 0, con el mar arriba (GH-68). Las dos vacías: la unidad no está ubicada,
     * y el plano la dibuja abajo, aparte. Aceptan vacío para que las filas que ya existían, y las de
     * la demostración que no las nombran, queden sin ubicar.
     *
     * <p>Que dos unidades del mismo balneario no compartan casilla lo revisa el servicio al guardar
     * el plano entero, no una restricción de la base: al intercambiar dos unidades, una restricción
     * única saltaría entre la primera actualización y la segunda.
     */
    private Integer posX;

    private Integer posY;

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

    /**
     * Revisa que la unidad pueda ir en esa casilla, sin moverla: las dos coordenadas o ninguna,
     * dentro de la grilla de 40 × 40, y no si está dada de baja. Sacarla del plano (las dos vacías)
     * siempre se puede.
     *
     * @throws InvalidPlanException si la casilla no vale o la unidad está dada de baja.
     */
    public void checkPlacement(Integer x, Integer y) {
        if (x == null && y == null) {
            return;
        }
        if (x == null || y == null) {
            throw new InvalidPlanException(
                    "La unidad " + identifier + " tiene que llevar la columna y la fila, o ninguna de las dos.");
        }
        if (x < 0 || y < 0 || x >= PLAN_SIZE || y >= PLAN_SIZE) {
            throw new InvalidPlanException("La unidad " + identifier + " queda fuera del plano: la grilla va hasta "
                    + PLAN_SIZE + " columnas por " + PLAN_SIZE + " filas.");
        }
        if (retired) {
            throw new InvalidPlanException("La unidad " + identifier + " está dada de baja: no se ubica en el plano.");
        }
    }

    /** La ubica en la casilla, o la saca del plano con las dos vacías. */
    public void placeAt(Integer x, Integer y) {
        checkPlacement(x, y);
        this.posX = x;
        this.posY = y;
    }

    /**
     * La da de baja (RF32): deja de ofrecerse y sale del plano, así su casilla queda libre para otra
     * unidad.
     */
    public void retire() {
        this.retired = true;
        this.posX = null;
        this.posY = null;
    }
}