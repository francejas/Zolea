package com.zolea.backend.dtos.client;

import com.zolea.backend.dtos.booking.BookingSummaryResponse;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.util.List;

/**
 * Una persona que reservó en el balneario de un administrador, con su historial <b>en ese
 * balneario</b>.
 *
 * <p>No es lo mismo que {@link ClientResponse}: acá el titular puede no tener cuenta. Una reserva
 * de mostrador guarda el nombre y el DNI en la propia reserva, así que esa persona es un cliente
 * del balneario aunque nunca se haya registrado. En ese caso {@code idClient}, {@code email} y
 * {@code phone} vienen vacíos y {@code walkIn} es {@code true}.
 *
 * <p>{@code totalSpent} lo suma el backend a propósito. Los importes son {@code BigDecimal}
 * justamente para no perder centavos, y sumarlos en el navegador con números de JavaScript
 * reintroduce el error que esa decisión evita.
 */
@Schema(description = "Un cliente del balneario, con su historial de reservas en ese balneario")
public record ResortClientResponse(

        @Schema(description = "Identificador de la cuenta. Vacío si reservó por mostrador, sin cuenta", example = "7")
        Long idClient,

        @Schema(description = "Nombre y apellido del titular", example = "Santiago Rodríguez")
        String fullName,

        @Schema(description = "DNI del titular", example = "38111222")
        String dni,

        @Schema(description = "Email. Vacío si reservó por mostrador", example = "santi.rodriguez@gmail.com")
        String email,

        @Schema(description = "Teléfono. Vacío si reservó por mostrador", example = "2235551234")
        String phone,

        @Schema(description = "Si reservó por mostrador, sin cuenta en el sistema", example = "false")
        boolean walkIn,

        @Schema(description = "Cuántas reservas hizo en este balneario", example = "3")
        int bookingCount,

        @Schema(description = "Lo que pagó y el balneario conservó: suma las confirmadas y la parte no reintegrada de las canceladas pagas",
                example = "25500.30")
        BigDecimal totalSpent,

        @Schema(description = "Sus reservas en este balneario")
        List<BookingSummaryResponse> bookings
) {
}
