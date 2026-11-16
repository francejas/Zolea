package com.zolea.backend.controllers;

import com.zolea.backend.dtos.booking.BookingCheckoutResponse;
import com.zolea.backend.dtos.booking.BookingRequest;
import com.zolea.backend.dtos.booking.BookingResponse;
import com.zolea.backend.dtos.booking.CancellationResponse;
import com.zolea.backend.dtos.booking.PaymentUrlResponse;
import com.zolea.backend.dtos.booking.WalkInBookingResponse;
import com.zolea.backend.exceptions.booking.WalkInWithClientException;
import com.zolea.backend.exceptions.booking.WebBookingWithWalkInException;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.services.BookingCheckoutService;
import com.zolea.backend.services.BookingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import static org.springframework.util.StringUtils.hasText;

@Slf4j
@RestController
@RequestMapping("/api/bookings")
@RequiredArgsConstructor
@Tag(name = "Reservas", description = "Creación, consulta y cancelación de reservas. Incluye los retornos y el aviso de MercadoPago, que son públicos.")
public class BookingController {

    private final BookingService bookingService;
    private final BookingCheckoutService checkoutService;

    // El clientId viaja en el cuerpo del pedido, así que hay que comprobar que sea el de quien
    // firma la petición: sin esto, cualquier usuario autenticado creaba reservas y generaba pagos
    // a nombre de otro. Se rechaza en vez de sobreescribirlo en silencio, para que un cliente mal
    // programado se entere en lugar de recibir una reserva con otro titular.
    // Un ADMIN no reserva por acá, ni a su nombre ni al de otro (RNF03): para eso está el
    // mostrador, que confirma sin pasar por MercadoPago y queda en su balneario.
    // El clientId es obligatorio: sin él, un cliente armaba una reserva sin titular con los datos
    // de mostrador, que después ni él podía ver (ZOL-176).
    @PreAuthorize("!hasRole('ADMIN') and #request.clientId != null and #request.clientId == principal.idClient")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping
    @Operation(summary = "Crear reserva web", description = "Crea la reserva y devuelve la URL de pago de MercadoPago.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Reserva creada, en estado PENDING, con su URL de pago"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos (como un huésped vacío), vinieron los datos de mostrador (walkInName o walkInDni), rango de fechas al revés, o unidad bloqueada u ocupada", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin credenciales o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Falta el clientId, es de otro cliente, o quien pide es un administrador: él usa la reserva de mostrador", content = @Content),
            @ApiResponse(responseCode = "404", description = "La unidad o el cliente no existen", content = @Content),
            @ApiResponse(responseCode = "502", description = "MercadoPago no respondió", content = @Content)
    })
    public ResponseEntity<BookingCheckoutResponse> createBooking(@Valid @RequestBody BookingRequest request) {
        // El titular a mano es solo del mostrador: la reserva web siempre es del cliente que pide.
        if (hasText(request.walkInName()) || hasText(request.walkInDni())) {
            throw new WebBookingWithWalkInException(
                    "La reserva web es del cliente que la pide: no lleva walkInName ni walkInDni, que son de la reserva de mostrador.");
        }
        var checkout = checkoutService.start(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new BookingCheckoutResponse(checkout.booking(), checkout.paymentUrl()));
    }

    @PreAuthorize("@bookingAccess.canRead(#id, principal)")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/{id}/pay")
    @Operation(summary = "Reintentar pago (reserva pendiente)", description = "Genera una nueva URL de MercadoPago para una reserva PENDING existente.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Una dirección de pago nueva para la misma reserva"),
            @ApiResponse(responseCode = "400", description = "La reserva ya no está pendiente (está confirmada o cancelada), o pasó la hora para pagarla", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "La reserva es de otro cliente o de otro balneario", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe una reserva con ese identificador", content = @Content),
            @ApiResponse(responseCode = "502", description = "MercadoPago no respondió", content = @Content)
    })
    public ResponseEntity<PaymentUrlResponse> retryPayment(@PathVariable Long id) {
        return ResponseEntity.ok(new PaymentUrlResponse(checkoutService.retry(id)));
    }

    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/walkin")
    // Solo sobre unidades del balneario del administrador (RNF03). Una unidad que no existe pasa,
    // para que el servicio responda su 404.
    @PreAuthorize("hasRole('ADMIN') and @unitAccess.belongsToResort(#request.rentalUnitId, principal.idManagedResort)")
    @Operation(summary = "Crear reserva presencial (Admin)", description = "Crea y confirma automáticamente la reserva sin pasar por MercadoPago.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Reserva confirmada, con un código QR por huésped"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos (como un huésped vacío), vino un clientId, o la unidad está bloqueada u ocupada", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador, o la unidad es de otro balneario", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe una unidad con ese identificador", content = @Content)
    })
    public ResponseEntity<WalkInBookingResponse> createWalkInBooking(@Valid @RequestBody BookingRequest request) {
        // La de mostrador es para quien no tiene cuenta. Con un clientId, un administrador se armaba
        // una reserva confirmada a su propio nombre y después la calificaba. El cero se sigue
        // aceptando: es como mandaba «sin cliente» el formulario viejo.
        if (request.clientId() != null && request.clientId() > 0) {
            throw new WalkInWithClientException(
                    "La reserva de mostrador es para quien no tiene cuenta: va sin clientId, con el nombre y el DNI del titular.");
        }
        BookingResponse booking = bookingService.createBooking(request);
        bookingService.confirmBookingPayment(booking.id());
        BookingResponse confirmed = bookingService.getBookingById(booking.id());
        return ResponseEntity.status(HttpStatus.CREATED).body(new WalkInBookingResponse(
                "Reserva presencial confirmada. Código/s QR generados.", confirmed));
    }

    // Devuelve las reservas DEL BALNEARIO del administrador. Antes devolvía las de los cinco:
    // el panel de admin mostraba las mismas 47 reservas y las mismas métricas para todos.
    // Un ADMIN sin balneario asignado sigue viendo todo, que es el caso del administrador general.
    @PreAuthorize("hasRole('ADMIN')")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping
    @Operation(summary = "Listar las reservas del balneario (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Las reservas del balneario del administrador"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador, o el administrador no tiene un balneario asignado", content = @Content)
    })
    public ResponseEntity<List<BookingResponse>> getAllBookings(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                bookingService.getBookingsByResortId(principal.requireManagedResort()));
    }

    // Solo el propio cliente. El administrador ve a sus clientes, con su historial en su
    // balneario, en GET /api/clients; por acá habría visto las reservas en los cinco (RNF03).
    @PreAuthorize("#clientId == principal.idClient")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/client/{clientId}")
    @Operation(summary = "Reservas de un cliente")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Las reservas de ese cliente, con sus códigos QR"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Son las reservas de otra persona. Un administrador ve a sus clientes en GET /api/clients", content = @Content)
    })
    public ResponseEntity<List<BookingResponse>> getBookingsByClient(@PathVariable Long clientId) {
        return ResponseEntity.ok(bookingService.getBookingsByClientId(clientId));
    }

    // Se comprueba ANTES de entrar al método, no después. Cuando se escribió esta anotación,
    // getBookingById escribía en la base como efecto secundario —ya no—, así que dejar pasar la
    // lectura y descartar la respuesta habría modificado datos a pedido de un intruso. Comprobar
    // antes sigue siendo lo correcto: leer un recurso ajeno para después decidir no mostrarlo
    // implica haberlo leído.
    @PreAuthorize("@bookingAccess.canRead(#id, principal)")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/{id}")
    @Operation(summary = "Detalle de una reserva")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La reserva, con sus huéspedes y sus códigos QR"),
            @ApiResponse(responseCode = "401", description = "Sin credenciales o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "La reserva es de otro cliente o de otro balneario", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe una reserva con ese identificador", content = @Content)
    })
    public ResponseEntity<BookingResponse> getBookingById(@PathVariable Long id) {
        return ResponseEntity.ok(bookingService.getBookingById(id));
    }

    @PreAuthorize("@bookingAccess.canRead(#id, principal)")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/{id}/cancellation")
    @Operation(summary = "Cuánto se reintegraría si se cancela hoy",
            description = "No cancela: dice si hoy se puede y cuánto se reintegraría, para mostrarlo antes de "
                    + "confirmar. PATCH /{id}/cancel aplica exactamente esto. El cliente: 100 % hasta dos días "
                    + "antes del inicio, 50 % el día anterior, y desde el inicio no se cancela; una pendiente, sin "
                    + "reintegro. El administrador de su balneario: 100 %, antes o durante la estadía. Una "
                    + "estadía que ya terminó no la cancela nadie.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Si se puede cancelar, con el reintegro, o el motivo si no"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "La reserva es de otro cliente o de otro balneario", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe una reserva con ese identificador", content = @Content)
    })
    public ResponseEntity<CancellationResponse> getCancellationTerms(
            @PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        if (principal.isAdmin()) {
            return ResponseEntity.ok(
                    bookingService.getCancellationTermsAsAdmin(id, principal.requireManagedResort()));
        }
        return ResponseEntity.ok(bookingService.getCancellationTermsAsClient(id, principal.getUsername()));
    }

    @SecurityRequirement(name = "bearerAuth")
    @PatchMapping("/{id}/cancel")
    @Operation(summary = "Cancelar reserva (Admin de su balneario o cliente dueño)",
            description = "Aplica la política de reintegro de GET /{id}/cancellation y devuelve la reserva con "
                    + "canceledAt, canceledBy y refundAmount. El reintegro es simulado: no se toca MercadoPago.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La reserva cancelada, con su reintegro. La unidad queda libre para esas fechas"),
            @ApiResponse(responseCode = "400", description = "La reserva ya estaba cancelada, la estadía ya empezó (si cancela el cliente) o ya terminó", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "La reserva es de otro cliente o de otro balneario", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe una reserva con ese identificador", content = @Content)
    })
    public ResponseEntity<BookingResponse> cancelBooking(
            @PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        if (principal.isAdmin()) {
            return ResponseEntity.ok(
                    bookingService.cancelBookingAsAdmin(id, principal.requireManagedResort()));
        }
        return ResponseEntity.ok(bookingService.cancelBookingAsClient(id, principal.getUsername()));
    }

    // ── Callbacks MercadoPago ────────────────────────────────────────────────

    /**
     * Adonde MercadoPago devuelve al cliente cuando el pago salió bien.
     *
     * <p>Es público, y tiene que serlo: quien llega acá viene del sitio de MercadoPago, sin el
     * token de la aplicación. Por eso <b>no se le cree nada de lo que trae en la URL</b>: la
     * confirmación se decide preguntándole a la pasarela. Antes este endpoint confirmaba la
     * reserva con el número que venía en la dirección y descartaba el estado que MercadoPago
     * informaba, así que cualquiera podía marcar como pagada una reserva ajena.
     *
     * <p>Los tres parámetros son opcionales a propósito. Eran obligatorios, y si MercadoPago no
     * mandaba alguno la petición moría con un error en pantalla en lugar de mostrar la reserva.
     */
    @GetMapping("/success")
    @Operation(summary = "Retorno de pago exitoso (MercadoPago)",
            description = "Comprueba el pago contra MercadoPago y recién entonces confirma la reserva.")
    public void handleSuccess(
            @RequestParam(value = "collection_id", required = false) String collectionId,
            @RequestParam(value = "external_reference", required = false) Long bookingId,
            HttpServletResponse response) throws IOException {

        boolean confirmada = bookingId != null
                && checkoutService.confirmIfPaid(bookingId, collectionId);

        // Si no se pudo comprobar el pago, el cliente va a "pendiente" y no a un error: el pago
        // puede haberse hecho igual y estar demorado, y decirle que falló sería mentirle.
        String destino = confirmada
                ? "/payment/success?bookingId=" + bookingId
                : "/payment/pending";
        response.sendRedirect(checkoutService.getFrontendUrl() + destino);
    }

    /**
     * Donde MercadoPago avisa por su cuenta, sin pasar por el navegador del cliente.
     *
     * <p>Es lo que despega el cobro del navegador. Hasta ahora la reserva se confirmaba cuando el
     * cliente volvía del sitio de MercadoPago; si cerraba la pestaña, nunca nos enterábamos de que
     * había pagado y el trabajo automático terminaba cancelando la reserva con la plata cobrada.
     *
     * <p>Es público, como el retorno, y por el mismo motivo: quien llama es MercadoPago, que no
     * tiene el token de la aplicación. Y por eso tampoco se le cree: el aviso trae solo un número de
     * pago, y ese número se consulta contra la pasarela antes de tocar nada.
     *
     * <p><b>Siempre responde 200</b>, incluso cuando decide no confirmar. Un código de error hace
     * que MercadoPago reintente, y reintentar no arregla un aviso de un pago rechazado ni uno que no
     * es de un pago: solo genera ruido. La contrapartida conocida es que si la pasarela está caída
     * justo en ese momento, ese aviso se pierde; la reserva igual se confirma cuando el cliente
     * vuelve del retorno.
     *
     * <p>Acepta las dos formas que usa MercadoPago: {@code type} + {@code data.id} en los webhooks
     * nuevos, y {@code topic} + {@code id} en los avisos del formato viejo.
     */
    @PostMapping("/notifications")
    @Operation(summary = "Aviso automático de MercadoPago (webhook)",
            description = "Lo llama MercadoPago, no el frontend. Consulta el pago y confirma la reserva.")
    @ApiResponses(
            @ApiResponse(responseCode = "200",
                    description = "Aviso recibido. Responde 200 aunque decida no confirmar: un código de error"
                            + " haría que MercadoPago reintente, y reintentar no arregla un aviso de un pago"
                            + " rechazado.",
                    content = @Content)
    )
    public ResponseEntity<Void> handlePaymentNotification(
            @RequestParam(value = "type", required = false) String type,
            @RequestParam(value = "topic", required = false) String topic,
            @RequestParam(value = "data.id", required = false) String dataId,
            @RequestParam(value = "id", required = false) String id) {

        String kind = type != null ? type : topic;
        String paymentId = dataId != null ? dataId : id;

        if (!"payment".equalsIgnoreCase(kind) || paymentId == null || paymentId.isBlank()) {
            log.debug("Aviso ignorado: tipo '{}', pago '{}'", kind, paymentId);
            return ResponseEntity.ok().build();
        }

        checkoutService.confirmFromNotification(paymentId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/pending")
    @Operation(summary = "Retorno de pago pendiente (MercadoPago)")
    public void handlePending(HttpServletResponse response) throws IOException {
        response.sendRedirect(checkoutService.getFrontendUrl() + "/payment/pending");
    }

    @GetMapping("/failure")
    @Operation(summary = "Retorno de pago fallido (MercadoPago)")
    public void handleFailure(HttpServletResponse response) throws IOException {
        response.sendRedirect(checkoutService.getFrontendUrl() + "/payment/failure");
    }
}
