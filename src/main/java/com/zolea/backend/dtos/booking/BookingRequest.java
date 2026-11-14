package com.zolea.backend.dtos.booking;

import com.zolea.backend.validation.HolderRequired;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.time.LocalDate;
import java.util.List;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Datos de una reserva.
 *
 * <p>Acá se valida la <b>forma</b> del pedido: qué campos tienen que venir. Que el fin no sea
 * anterior al inicio, que la unidad no esté bloqueada y que no se pise con otra reserva son reglas
 * del negocio, y viven en {@code Booking} y en {@code BookingService}: si estuvieran también acá
 * habría dos fuentes de verdad para la misma regla.
 */
@HolderRequired
public record BookingRequest(
        @Schema(description = "Primer día de la reserva. Se cobra y se ocupa, extremos incluidos", example = "2026-01-15")
        @NotNull(message = "La fecha de inicio es obligatoria")
        LocalDate startDate,

        @Schema(description = "Último día de la reserva, incluido. Del 15 al 17 son tres días", example = "2026-01-17")
        @NotNull(message = "La fecha de fin es obligatoria")
        LocalDate endDate,

        // Sin @NotNull ni @Positive a propósito: la reserva de mostrador llega con cero.
        // Ver la anotación @HolderRequired de arriba.
        @Schema(description = "Quién reserva. Tiene que ser el usuario del token; la reserva de mostrador va sin él", example = "7")
        Long clientId,

        @Schema(description = "La carpa o sombrilla que se reserva", example = "12")
        @NotNull(message = "Hay que indicar qué unidad se reserva")
        @Positive(message = "El identificador de la unidad no es válido")
        Long rentalUnitId,

        @Schema(description = "Los acompañantes. El titular no va acá: se agrega solo, con su propio código QR")
        List<@NotNull(message = "La lista de huéspedes no puede tener elementos vacíos") GuestRequest> guests,

        // El titular de una reserva de mostrador, que no tiene cuenta. Que venga uno de los dos
        // —cliente o titular a mano— lo comprueba @HolderRequired.
        @Schema(description = "Titular de una reserva de mostrador, para alguien que no tiene cuenta. La reserva web no lo acepta", example = "Marta Gómez")
        String walkInName,
        @Schema(description = "DNI del titular de mostrador. La reserva web no lo acepta", example = "31222333")
        String walkInDni
) {
}
