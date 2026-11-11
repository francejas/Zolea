package com.zolea.backend.controllers;

import com.zolea.backend.dtos.resort.ResortActionResponse;
import com.zolea.backend.dtos.resort.ResortRequest;
import com.zolea.backend.dtos.resort.ResortResponse;
import com.zolea.backend.dtos.resort.ResortStatsResponse;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.services.ResortService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/resorts")
@RequiredArgsConstructor
@Tag(name = "Balnearios", description = "CRUD de balnearios y gestión por parte del administrador")
public class ResortController {

    private final ResortService resortService;

    @GetMapping
    @Operation(summary = "Listar todos los balnearios", description = "Público. Devuelve todos los balnearios activos con sus unidades y amenidades.")
    public ResponseEntity<List<ResortResponse>> getResorts() {
        return ResponseEntity.ok(resortService.getAll());
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
            @ApiResponse(responseCode = "200", description = "El balneario como quedó. Lo que no venga en el pedido no se toca, y el email del administrador no se cambia por esta vía"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador", content = @Content),
            @ApiResponse(responseCode = "404", description = "El administrador no tiene balneario asignado", content = @Content)
    })
    public ResponseEntity<ResortActionResponse> updateMyResort(Authentication auth, @RequestBody ResortRequest request) {
        ResortResponse saved = resortService.updateMyResort(auth.getName(), request);
        return ResponseEntity.ok(new ResortActionResponse("Balneario actualizado correctamente.", saved));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Registrar nuevo balneario (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Balneario creado"),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador", content = @Content)
    })
    public ResponseEntity<ResortActionResponse> registerResort(@RequestBody ResortRequest request) {
        ResortResponse saved = resortService.registerResort(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new ResortActionResponse("Balneario registrado correctamente.", saved));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Actualizar balneario por ID (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El balneario como quedó. Lo que no venga en el pedido no se toca"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe un balneario con ese identificador", content = @Content)
    })
    public ResponseEntity<ResortActionResponse> updateResort(@PathVariable Long id, @RequestBody ResortRequest request) {
        ResortResponse saved = resortService.updateResort(id, request);
        return ResponseEntity.ok(new ResortActionResponse("Balneario actualizado correctamente.", saved));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}/inactive")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Desactivar balneario (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El balneario desactivado. Deja de aparecer en el listado público"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe un balneario con ese identificador", content = @Content)
    })
    public ResponseEntity<ResortActionResponse> toInactiveResort(@PathVariable Long id) {
        ResortResponse saved = resortService.toInactive(id);
        return ResponseEntity.ok(new ResortActionResponse("Balneario desactivado correctamente.", saved));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}/active")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Activar balneario (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El balneario activado. Vuelve a aparecer en el listado público"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe un balneario con ese identificador", content = @Content)
    })
    public ResponseEntity<ResortActionResponse> toActiveResort(@PathVariable Long id) {
        ResortResponse saved = resortService.toActive(id);
        return ResponseEntity.ok(new ResortActionResponse("Balneario activado correctamente.", saved));
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
