package com.zolea.backend.models;

import com.zolea.backend.exceptions.booking.BookingStateException;
import com.zolea.backend.exceptions.booking.InvalidBookingRangeException;
import jakarta.persistence.*;
import org.hibernate.annotations.BatchSize;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

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
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "booking")
public class Booking {

    /** Centavos. Todo importe del sistema se guarda y se compara con esta escala. */
    public static final int MONEY_SCALE = 2;

    /** Cancelando con al menos estos días de anticipación se reintegra todo lo pagado. */
    private static final int FULL_REFUND_DAYS = 2;

    /**
     * Cuánto tiempo hay para pagar una reserva pendiente, desde que se creó. Pasado el plazo, el link
     * de pago vence y no se puede pedir uno nuevo. Era de 24 horas, y con eso una persona podía dejar
     * ocupadas muchas unidades un día entero.
     */
    public static final Duration PAYMENT_WINDOW = Duration.ofHours(1);

    /**
     * Cuánto espera la limpieza automática después de que vence el plazo de pago para cancelar la
     * reserva. Es para el pago que se empezó antes de la hora y MercadoPago aprueba un poco después:
     * la reserva todavía está pendiente y se confirma normalmente.
     */
    public static final Duration CLEANUP_GRACE = Duration.ofMinutes(15);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    // precision/scale son lo que hace que la columna sea DECIMAL(12,2) y no un decimal por
    // defecto: 12 dígitos en total, 2 de centavos.
    @Column(name = "total_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal totalPrice;

    @Enumerated(EnumType.STRING)
    private Status status;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    // --- NUEVOS CAMPOS PARA RESERVAS PRESENCIALES ---
    @Column(name = "walk_in_name")
    private String walkInName;

    @Column(name = "walk_in_dni")
    private String walkInDni;
    // -----

    // --- La cancelación, para el reintegro y para los avisos del panel del balneario ---
    /** Cuándo se canceló, con el reloj de la aplicación. */
    @Column(name = "canceled_at")
    private LocalDateTime canceledAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "canceled_by")
    private CanceledBy canceledBy;

    /** Lo que se reintegró, con la escala de la plata; null si la reserva no estaba pagada. */
    @Column(name = "refund_amount", precision = 12, scale = 2)
    private BigDecimal refundAmount;

    // LAZY explícito: por defecto un @ManyToOne es EAGER, así que listar reservas traía el cliente
    // y la unidad de cada una en consultas aparte. Los mapeos que sí los necesitan los piden por
    // @EntityGraph, en una sola consulta.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_client")
    @ToString.Exclude
    private Client client;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_rental_unit")
    @ToString.Exclude
    private RentalUnit rentalUnit;

    // BatchSize es la red para las consultas que NO declaran un @EntityGraph: en vez de una
    // consulta por reserva para traer sus huéspedes, Hibernate los pide de a 25.
    // cascade + orphanRemoval: los huéspedes son parte de la reserva, no entidades sueltas. Sin
    // esto, borrar una reserva dejaba sus huéspedes huérfanos —con sus QR todavía válidos— y cada
    // sitio que creaba un huésped tenía que acordarse de guardarlo por su cuenta.
    @OneToMany(mappedBy = "booking", cascade = CascadeType.ALL, orphanRemoval = true)
    @BatchSize(size = 25)
    @ToString.Exclude
    private List<Guest> guests;

    // ---------------------------------------------------------------------
    // Reglas de la reserva
    //
    // Viven acá y no en el servicio porque son verdades de la reserva misma: valen sin importar
    // quién la esté modificando. Antes el estado se cambiaba desde afuera con setStatus(...) en
    // cinco lugares distintos, y por eso una reserva cancelada podía volver a confirmarse con solo
    // reabrir la URL de retorno del pago: no había un lugar donde estuviera escrito qué
    // transiciones son válidas.
    // ---------------------------------------------------------------------

    /**
     * Cuántos días ocupa la reserva, contando los dos extremos.
     *
     * <p>Del 10 al 12 son <b>tres</b> días, no dos: el huésped usa la unidad los días 10, 11 y 12.
     * Es la misma convención que usa la consulta de disponibilidad, que bloquea esos tres días.
     * Antes el precio contaba la resta entre fechas —fin exclusivo— y la disponibilidad contaba los
     * extremos, así que una reserva de un solo día salía $0 y MercadoPago rechazaba el cobro.
     */
    public long occupiedDays() {
        return java.time.temporal.ChronoUnit.DAYS.between(startDate, endDate) + 1;
    }

    /**
     * Calcula y fija el total: los días que ocupa la reserva, por el precio diario de la unidad.
     *
     * <p>La cuenta se hace en {@link BigDecimal} y no en {@code double} porque un {@code double} no
     * puede representar exactamente la mayoría de los importes con centavos: una unidad a $8.500,10
     * por tres días daba <b>25500.300000000003</b>, y ese número era el que viajaba a la pasarela de
     * pago. Con enteros no se notaba, y todos los precios de la demostración lo son.
     */
    public void calculateTotalPrice(BigDecimal dailyPrice) {
        totalPrice = dailyPrice
                .multiply(BigDecimal.valueOf(occupiedDays()))
                .setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }

    /** El rango es válido si el fin no es anterior al inicio. Un solo día es un rango válido. */
    public void validateDateRange() {
        if (startDate == null || endDate == null) {
            throw new InvalidBookingRangeException("La reserva necesita fecha de inicio y de fin.");
        }
        if (endDate.isBefore(startDate)) {
            throw new InvalidBookingRangeException(
                    "La fecha de fin (" + endDate + ") no puede ser anterior a la de inicio ("
                            + startDate + ").");
        }
    }

    /**
     * Confirma el pago de la reserva.
     *
     * <p>Es <b>idempotente</b>: confirmar una reserva ya confirmada no hace nada y no falla. Tiene
     * que serlo porque el disparador es una URL de retorno que el navegador puede volver a abrir,
     * y antes cada visita creaba un huésped nuevo con su propio QR.
     *
     * @throws BookingStateException si la reserva está cancelada. Una reserva que el trabajo
     *         automático canceló por vencimiento no puede revivir por un pago que llega tarde.
     */
    public void confirm() {
        if (status == Status.CANCELED) {
            throw new BookingStateException(
                    "La reserva " + id + " está cancelada y no puede confirmarse.");
        }
        status = Status.CONFIRMED;
    }

    /**
     * Cuánto se reintegra si la reserva se cancela {@code today}, o por qué no se puede. Es la
     * política de cancelación del TFI, y el reintegro es simulado: no se toca MercadoPago.
     *
     * <p>Se cuenta por días, porque las reservas no tienen hora:
     * <ul>
     *   <li>pendiente: se cancela sin reintegro, porque no se pagó;</li>
     *   <li>confirmada, hasta dos días antes del inicio: el 100 % del total;</li>
     *   <li>confirmada, el día anterior al inicio: el 50 %;</li>
     *   <li>desde el día de inicio, no se cancela;</li>
     *   <li>si cancela el balneario: el 100 %, antes o durante la estadía;</li>
     *   <li>una estadía que ya terminó no se cancela, tampoco el balneario: ya se usó, y
     *       reintegrarla le restaría ingresos al Panel y le sacaría la reseña al cliente.</li>
     * </ul>
     *
     * @param today   hoy, con el reloj de la aplicación.
     * @param byAdmin si cancela el administrador del balneario.
     */
    public CancellationTerms refundFor(LocalDate today, boolean byAdmin) {
        if (status == Status.CANCELED) {
            return CancellationTerms.rejected("La reserva ya está cancelada.");
        }
        if (status == Status.PENDING) {
            return CancellationTerms.withoutPayment();
        }
        // Antes que el caso del balneario: una estadía terminada no la cancela nadie.
        if (today.isAfter(endDate)) {
            return CancellationTerms.rejected("La estadía ya terminó: no se puede cancelar.");
        }
        if (byAdmin) {
            return CancellationTerms.refund(100, percentOfTotal(100));
        }

        long daysBefore = ChronoUnit.DAYS.between(today, startDate);
        if (daysBefore >= FULL_REFUND_DAYS) {
            return CancellationTerms.refund(100, percentOfTotal(100));
        }
        if (daysBefore == 1) {
            return CancellationTerms.refund(50, percentOfTotal(50));
        }
        return CancellationTerms.rejected("Tu estadía ya empezó: no se puede cancelar.");
    }

    /**
     * Cancela la reserva con la política de {@link #refundFor} y deja registrado cuándo, quién y
     * cuánto se reintegró.
     *
     * @param now cuándo, con el reloj de la aplicación.
     * @param by  quién cancela: el cliente, el balneario o el sistema, al vencer una pendiente.
     * @throws com.zolea.backend.exceptions.booking.BookingAlreadyCanceledException si ya estaba
     *         cancelada.
     * @throws BookingStateException si la política no deja cancelarla, con el motivo.
     */
    public void cancel(LocalDateTime now, CanceledBy by) {
        if (status == Status.CANCELED) {
            throw new com.zolea.backend.exceptions.booking.BookingAlreadyCanceledException(
                    "La reserva ya está cancelada");
        }
        CancellationTerms terms = refundFor(now.toLocalDate(), by == CanceledBy.ADMIN);
        if (!terms.allowed()) {
            throw new BookingStateException(terms.reason());
        }
        status = Status.CANCELED;
        canceledAt = now;
        canceledBy = by;
        refundAmount = terms.refundAmount();
    }

    private BigDecimal percentOfTotal(int percent) {
        return totalPrice.multiply(BigDecimal.valueOf(percent))
                .divide(BigDecimal.valueOf(100), MONEY_SCALE, RoundingMode.HALF_UP);
    }

    /** Si la reserva ya tiene al menos un huésped con su QR. */
    public boolean hasGuests() {
        return guests != null && !guests.isEmpty();
    }

    /**
     * Agrega un huésped a la reserva y devuelve la instancia creada.
     *
     * <p>Único punto de creación de {@code Guest} del sistema. El mismo bloque estaba copiado en
     * tres lugares —al crear, al confirmar y al consultar— y por eso la reserva de mostrador
     * terminaba con el nombre del cliente semilla en vez del que había cargado el administrador.
     */
    public Guest addGuest(String fullName, String dni) {
        Guest guest = new Guest();
        guest.setBooking(this);
        guest.setFullName(fullName);
        guest.setDni(dni);
        guest.setQrToken(UUID.randomUUID().toString());
        guest.setIsEntryValidated(false);
        if (guests == null) {
            guests = new ArrayList<>();
        }
        guests.add(guest);
        return guest;
    }

    /**
     * El nombre y el DNI del titular, sea una cuenta registrada o una reserva de mostrador.
     *
     * <p>Devuelve {@code null} si no hay ninguno de los dos, que es el caso de una reserva sin
     * titular identificable.
     */
    public String[] holderDetails() {
        if (isWalkIn()) {
            return new String[]{walkInName, walkInDni};
        }
        if (client != null) {
            return new String[]{client.getFirstName() + " " + client.getLastName(), client.getDni()};
        }
        return null;
    }
    /**
     * Si el titular vino sin cuenta: su nombre y su DNI están en {@code walkInName} y
     * {@code walkInDni}, no en un {@code Client}.
     *
     * <p>Mirar solo {@code client == null} no alcanza. Los datos de demostración dejan además
     * {@code client} apuntando a la cuenta comodín «Cliente Mostrador», así que quien manda es el
     * nombre de mostrador — que es la misma regla que ya usaba {@link #holderDetails()} para que el
     * código QR saliera con el nombre de quien realmente entra.
     */
    public boolean isWalkIn() {
        return walkInName != null && !walkInName.isBlank();
    }
}
