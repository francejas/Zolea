package com.zolea.backend.controllers;

import com.zolea.backend.dtos.resort.ResortActionResponse;
import com.zolea.backend.dtos.resort.ResortRegistrationRequest;
import com.zolea.backend.dtos.resort.ResortRequest;
import com.zolea.backend.dtos.resort.ResortResponse;
import com.zolea.backend.dtos.resort.ResortSearch;
import com.zolea.backend.dtos.resort.ResortStatsResponse;
import com.zolea.backend.dtos.resort.ResortSummaryResponse;
import com.zolea.backend.exceptions.resort.ResortRegistrationInvalidException;
import com.zolea.backend.models.UnitType;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.services.GuestService;
import com.zolea.backend.services.ResortService;
import com.zolea.backend.dtos.guest.GuestEntryResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/resorts")
@RequiredArgsConstructor
@Tag(name = "Balnearios", description = "CRUD de balnearios y gestión por parte del administrador")
public class ResortController {

    private final ResortService resortService;
    private final GuestService guestService;
    private final Validator validator;

    @GetMapping
    @Operation(summary = "Listar y buscar balnearios",
            description = "Público. Sin filtros, todos los balnearios activos con sus unidades y amenidades. "
                    + "Con cualquier filtro, solo los activos que tienen al menos una unidad no bloqueada que "
                    + "cumpla el tipo y el precio y, si vienen fechas, esté libre en esas fechas: sin una reserva "
                    + "pendiente o confirmada que se pise con ellas, contando los dos extremos. Con fechas, "
                    + "availableUnits dice cuántas unidades cumplen; sin fechas es null.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Los balnearios que cumplen; la lista vacía si ninguno"),
            @ApiResponse(responseCode = "400", description = "Una sola de las dos fechas, from después de to, from en el pasado, un type que no existe o un parámetro mal escrito", content = @Content)
    })
    public ResponseEntity<List<ResortResponse>> getResorts(
            @Parameter(description = "Nombre o ubicación, sin distinguir mayúsculas", example = "mar del plata")
            @RequestParam(required = false) String q,
            @Parameter(description = "Primer día, AAAA-MM-DD. Va con to; desde hoy", example = "2027-01-15")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "Último día, incluido, AAAA-MM-DD. Va con from", example = "2027-01-17")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = "Tipo de unidad", example = "TENT")
            @RequestParam(required = false) UnitType type,
            @Parameter(description = "Precio diario máximo, incluido", example = "20000")
            @RequestParam(required = false) BigDecimal maxPrice,
            @Parameter(description = "Servicios que tiene que tener el balneario, todos. Separados por coma "
                    + "o repitiendo el parámetro", example = "[1, 2]")
            @RequestParam(required = false) List<Long> amenityIds) {
        return ResponseEntity.ok(resortService.search(
                new ResortSearch(q, from, to, type, maxPrice, amenityIds)));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtener balneario por ID", description = "Público.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El balneario con sus unidades y sus servicios"),
            @ApiResponse(responseCode = "404", description = "No existe un balneario con ese identificador", content = @Content)
    })
    public ResponseEntity<ResortResponse> getResortById(@PathVariable Long id) {
        return ResponseEntity.ok(resortService.getResortById(id));
    }

    @GetMapping("/{id}/occupied-units")
    @Operation(summary = "Unidades ocupadas en unas fechas",
            description = "Público. Los idRentalUnit del balneario que tienen una reserva pendiente o confirmada "
                    + "que se pisa con esas fechas, contando los dos extremos: la misma regla que se aplica al "
                    + "reservar. Las bloqueadas ya vienen marcadas en la ficha del balneario.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Los ids de las unidades ocupadas; la lista vacía si no hay ninguna"),
            @ApiResponse(responseCode = "400", description = "Falta alguna de las dos fechas, from después de to, from en el pasado o una fecha mal escrita", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe un balneario con ese identificador", content = @Content)
    })
    public ResponseEntity<List<Long>> getOccupiedUnits(
            @PathVariable Long id,
            @Parameter(description = "Primer día, AAAA-MM-DD; desde hoy", example = "2027-01-15")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "Último día, incluido, AAAA-MM-DD", example = "2027-01-17")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        // Las fechas van como opcionales a propósito: si faltan, el servicio responde 400 con el
        // motivo, en vez del error genérico de Spring por un parámetro obligatorio.
        return ResponseEntity.ok(resortService.getOccupiedUnitIds(id, from, to));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/my")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Obtener mi balneario (Admin)", description = "Devuelve el balneario asociado al email del JWT.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El balneario del administrador que hace el pedido"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador", content = @Content),
            @ApiResponse(responseCode = "404", description = "El administrador no tiene balneario asignado", content = @Content)
    })
    public ResponseEntity<ResortResponse> getMyResort(Authentication auth) {
        return ResponseEntity.ok(resortService.getMyResort(auth.getName()));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/my")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Actualizar mi balneario (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El balneario como quedó. La descripción y la foto se reemplazan siempre: vacías o sin mandar, se borran. El nombre, la ubicación y los servicios, si no vienen, no se tocan. El email del administrador no se cambia por esta vía"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador", content = @Content),
            @ApiResponse(responseCode = "404", description = "El administrador no tiene balneario asignado", content = @Content)
    })
    public ResponseEntity<ResortActionResponse> updateMyResort(Authentication auth, @RequestBody ResortRequest request) {
        ResortResponse saved = resortService.updateMyResort(auth.getName(), request);
        return ResponseEntity.ok(new ResortActionResponse("Balneario actualizado correctamente.", saved));
    }

    /** La lista de la cuenta de Zolea (#71): todos los balnearios, también los inactivos. */
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/all")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Todos los balnearios (cuenta de Zolea)",
            description = "Solo la cuenta de Zolea, un administrador sin balneario. Activos e inactivos, ordenados "
                    + "por nombre, con su administrador y cuántas unidades tienen, sin las dadas de baja.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Los balnearios; la lista vacía si no hay ninguno"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser la cuenta de Zolea: un cliente o el administrador de un balneario no pueden", content = @Content)
    })
    public ResponseEntity<List<ResortSummaryResponse>> getAllResorts(@AuthenticationPrincipal UserPrincipal principal) {
        principal.requireZoleaAccount();
        return ResponseEntity.ok(resortService.getAllForZolea());
    }

    /**
     * Dar de alta un balneario es de la cuenta de Zolea, como el catálogo de servicios (15.7): antes
     * cualquier administrador podía sumar balnearios a la portada. Desde #71 el alta trae también la
     * cuenta de su administrador. Se mira que sea la cuenta de Zolea antes de validar el pedido, para
     * que el administrador de un balneario reciba el 403 y no un 400: por eso el cuerpo no lleva
     * {@code @Valid} y se valida a mano.
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Registrar un balneario con su administrador (cuenta de Zolea)",
            description = "Solo la cuenta de Zolea, un administrador sin balneario. Crea el balneario, activo, y la "
                    + "cuenta de su administrador con ese balneario asignado y la contraseña provisoria del pedido. "
                    + "Los errores de un campo del administrador van en campos como admin.email.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Balneario y administrador creados"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos, con el detalle en campos; o ya hay un balneario con ese nombre", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser la cuenta de Zolea: un cliente o el administrador de un balneario no pueden", content = @Content),
            @ApiResponse(responseCode = "409", description = "El email, el teléfono o el DNI del administrador ya son de otra cuenta, con el campo en campos", content = @Content)
    })
    public ResponseEntity<ResortActionResponse> registerResort(@RequestBody ResortRegistrationRequest request,
                                                               @AuthenticationPrincipal UserPrincipal principal) {
        principal.requireZoleaAccount();
        validate(request);
        ResortResponse saved = resortService.registerResort(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new ResortActionResponse("Balneario registrado correctamente.", saved));
    }

    /** Las anotaciones del pedido, como haría {@code @Valid}, con cada error en su campo. */
    private void validate(ResortRegistrationRequest request) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (ConstraintViolation<ResortRegistrationRequest> violation : validator.validate(request)) {
            fields.putIfAbsent(violation.getPropertyPath().toString(), violation.getMessage());
        }
        if (!fields.isEmpty()) {
            throw new ResortRegistrationInvalidException(fields);
        }
    }

    @PreAuthorize("hasRole('ADMIN') and @resortAccess.isManagedBy(#id, principal.idManagedResort)")
    @PutMapping("/{id}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Actualizar balneario por ID (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El balneario como quedó. Lo que no venga en el pedido no se toca"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser el administrador de un balneario", content = @Content),
            @ApiResponse(responseCode = "404", description = "El balneario no existe, o es de otro administrador: la respuesta es la misma", content = @Content)
    })
    public ResponseEntity<ResortActionResponse> updateResort(@PathVariable Long id, @RequestBody ResortRequest request) {
        ResortResponse saved = resortService.updateResort(id, request);
        return ResponseEntity.ok(new ResortActionResponse("Balneario actualizado correctamente.", saved));
    }

    @PreAuthorize("hasRole('ADMIN') and @resortAccess.isManagedByOrZolea(#id, principal.idManagedResort)")
    @PutMapping("/{id}/inactive")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Desactivar balneario (Admin o cuenta de Zolea)",
            description = "Su administrador, o la cuenta de Zolea sobre cualquier balneario.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El balneario desactivado. Deja de aparecer en el listado público"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser el administrador de un balneario o la cuenta de Zolea", content = @Content),
            @ApiResponse(responseCode = "404", description = "El balneario no existe, o es de otro administrador: la respuesta es la misma", content = @Content)
    })
    public ResponseEntity<ResortActionResponse> toInactiveResort(@PathVariable Long id) {
        ResortResponse saved = resortService.toInactive(id);
        return ResponseEntity.ok(new ResortActionResponse("Balneario desactivado correctamente.", saved));
    }

    @PreAuthorize("hasRole('ADMIN') and @resortAccess.isManagedByOrZolea(#id, principal.idManagedResort)")
    @PutMapping("/{id}/active")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Activar balneario (Admin o cuenta de Zolea)",
            description = "Su administrador, o la cuenta de Zolea sobre cualquier balneario.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El balneario activado. Vuelve a aparecer en el listado público"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser el administrador de un balneario o la cuenta de Zolea", content = @Content),
            @ApiResponse(responseCode = "404", description = "El balneario no existe, o es de otro administrador: la respuesta es la misma", content = @Content)
    })
    public ResponseEntity<ResortActionResponse> toActiveResort(@PathVariable Long id) {
        ResortResponse saved = resortService.toActive(id);
        return ResponseEntity.ok(new ResortActionResponse("Balneario activado correctamente.", saved));
    }


    // El balneario sale de la sesión, como en /my/stats.
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/my/entries")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Ingresos de un día en mi balneario (Admin)",
            description = "Cada validación exitosa del día, de la más nueva a la más vieja, con el nombre del huésped, la "
                    + "unidad, la hora y cómo se validó (QR, CODE o DNI). Sin fecha, hoy en Buenos Aires.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Los ingresos del día; vacío si no entró nadie"),
            @ApiResponse(responseCode = "400", description = "Una fecha mal escrita", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador, o el administrador no tiene un balneario asignado", content = @Content)
    })
    public ResponseEntity<List<GuestEntryResponse>> getMyEntries(
            @AuthenticationPrincipal UserPrincipal principal,
            @Parameter(description = "El día, AAAA-MM-DD; sin él, hoy", example = "2026-01-10")
            @RequestParam(required = false) LocalDate date) {
        return ResponseEntity.ok(guestService.getResortEntries(principal.requireManagedResort(), date));
    }

    // El balneario sale de la sesión, nunca de un parámetro: cada admin ve solo los números del suyo.
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/my/stats")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Estadísticas de mi balneario (Admin)",
            description = "Los números del Panel con gráficos: el resumen de hoy, la ocupación por día, los ingresos "
                    + "por mes y las cinco unidades más reservadas. Sin fechas, del primer día del mes pasado al "
                    + "último del mes que viene; van las dos fechas o ninguna, hasta 366 días. Solo cuentan las "
                    + "reservas confirmadas, salvo las pendientes del resumen de hoy.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Las estadísticas del balneario del administrador"),
            @ApiResponse(responseCode = "400", description = "Una sola de las dos fechas, from después de to, un rango de más de 366 días o una fecha mal escrita", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador, o el administrador no tiene un balneario asignado", content = @Content)
    })
    public ResponseEntity<ResortStatsResponse> getMyStats(
            @AuthenticationPrincipal UserPrincipal principal,
            @Parameter(description = "Primer día del rango, AAAA-MM-DD", example = "2026-10-01")
            @RequestParam(required = false) LocalDate from,
            @Parameter(description = "Último día del rango, incluido, AAAA-MM-DD", example = "2026-12-31")
            @RequestParam(required = false) LocalDate to) {
        return ResponseEntity.ok(resortService.getResortStats(principal.requireManagedResort(), from, to));
    }
}
