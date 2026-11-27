package com.zolea.backend.controllers;

import com.zolea.backend.dtos.guest.GuestValidationResponse;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.services.GuestService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * Validar el ingreso marca el código como usado y devuelve el nombre y la unidad del huésped, así
 * que lo hace solo el administrador, y sobre las reservas de su balneario: el mismo criterio que el
 * resto del panel.
 */
@RestController
@RequestMapping("/api/guests")
@RequiredArgsConstructor
@Tag(name = "Huéspedes", description = "Validación de ingreso por QR o DNI")
public class GuestController {

    private final GuestService guestService;

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/validate/{token}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Validar ingreso por token QR (Admin)", description = "Registra el ingreso del huésped (una fila nueva por cada validación, con la fecha y la hora, quién validó y si fue con el QR o con el código escrito) y devuelve sus datos. El código sirve todas las veces que haga falta mientras dura la estadía. Solo para reservas del balneario del administrador.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Ingreso registrado. El mismo código vuelve a servir durante toda la estadía"),
            @ApiResponse(responseCode = "400", description = "La reserva no está paga, no empezó todavía o ya venció", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador, o el código es de una reserva de otro balneario", content = @Content),
            @ApiResponse(responseCode = "404", description = "El código no existe", content = @Content)
    })
    public ResponseEntity<GuestValidationResponse> validateGuestEntry(
            @PathVariable String token,
            @Parameter(description = "true si el código se escribió a mano: el ingreso queda como «código» y no como QR")
            @RequestParam(defaultValue = "false") boolean typed,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(guestService.validateGuestEntry(
                token, typed, principal.requireManagedResort(), principal.idClient()));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/validate/dni/{dni}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Validar ingreso por DNI (Admin)", description = "Alternativa al QR para validar ingreso. Sirve todas las veces que haga falta mientras dura la estadía. Busca solo entre las reservas del balneario del administrador.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Ingreso registrado"),
            @ApiResponse(responseCode = "400", description = "Hay una reserva con ese DNI, pero no está vigente hoy", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador", content = @Content),
            @ApiResponse(responseCode = "404", description = "No hay ninguna reserva confirmada con ese DNI en el balneario", content = @Content)
    })
    public ResponseEntity<GuestValidationResponse> validateGuestEntryByDni(
            @PathVariable String dni,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(guestService.validateGuestEntryByDni(
                dni, principal.requireManagedResort(), principal.idClient()));
    }
}
