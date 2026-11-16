package com.zolea.backend.controllers;

import com.zolea.backend.dtos.rentalunit.RentalUnitRequest;
import com.zolea.backend.dtos.rentalunit.RentalUnitResponse;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.services.RentalUnitService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

@Validated
@RestController
@RequestMapping("/api/rental-units")
@RequiredArgsConstructor
@Tag(name = "Unidades de alquiler", description = "Gestión de carpas y sombrillas del balneario")
public class RentalUnitController {

    // @Validated es lo que hace que se comprueben las anotaciones puestas sobre los parámetros
    // sueltos del método, como el @Positive del precio. @Valid por sí solo cubre el cuerpo del
    // pedido, no los parámetros de la URL.

    private final RentalUnitService rentalUnitService;

    // El resortId viaja en el cuerpo, igual que el clientId de las reservas: sin comprobarlo, un
    // administrador podía crear unidades en el balneario de otro.
    @PreAuthorize("hasRole('ADMIN') and #request.resortId == principal.idManagedResort")
    @PostMapping
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Crear unidad de alquiler (Admin)", description = "Crea una carpa o sombrilla asociada al balneario.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La unidad creada"),
            @ApiResponse(responseCode = "400", description = "Faltan datos, o el precio no es positivo", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "El balneario indicado no es el del administrador", content = @Content),
            @ApiResponse(responseCode = "409", description = "Ya hay una unidad con ese identificador en el balneario", content = @Content)
    })
    public ResponseEntity<RentalUnitResponse> createRentalUnit(
            @Valid @RequestBody RentalUnitRequest request) {
        return new ResponseEntity<>(rentalUnitService.createRentalUnit(request), HttpStatus.CREATED);
    }

    // Un administrador ve las unidades de su balneario; un cliente, todas (necesita elegir en
    // cualquier balneario). El filtro por balneario para el cliente lo da GET /api/resorts/{id},
    // que ya devuelve las unidades del balneario que está mirando.
    @GetMapping
    @Operation(summary = "Listar unidades", description = "Para un administrador, las de su balneario.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Las unidades. Un administrador ve las de su balneario; un cliente, todas"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "El administrador no tiene un balneario asignado", content = @Content)
    })
    public ResponseEntity<List<RentalUnitResponse>> getAllRentalUnits(
            @AuthenticationPrincipal UserPrincipal principal) {
        // Un administrador filtra siempre por su balneario; un cliente nunca. El nulo es la
        // respuesta correcta para un cliente, y un estado inválido para un administrador: por eso
        // se distingue por rol y no por si el dato viene vacío.
        return ResponseEntity.ok(rentalUnitService.getAllRentalUnits(
                principal.isAdmin() ? principal.requireManagedResort() : null));
    }

    @PreAuthorize("hasRole('ADMIN') and @unitAccess.belongsToResort(#id, principal.idManagedResort)")
    @PatchMapping("/{id}/price")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Actualizar precio de una unidad (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La unidad con su precio nuevo"),
            @ApiResponse(responseCode = "400", description = "El precio no es positivo, o la unidad está dada de baja", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "La unidad es de otro balneario", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe una unidad con ese identificador", content = @Content)
    })
    public ResponseEntity<RentalUnitResponse> updatePrice(
            @PathVariable Long id,
            @RequestParam @Positive(message = "El precio tiene que ser mayor que cero")
            BigDecimal newPrice) {
        return ResponseEntity.ok(rentalUnitService.updatePrice(id, newPrice));
    }

    @PreAuthorize("hasRole('ADMIN') and @unitAccess.belongsToResort(#id, principal.idManagedResort)")
    @PatchMapping("/{id}/block")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Bloquear / desbloquear unidad (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La unidad como quedó. Una unidad bloqueada no se puede reservar"),
            @ApiResponse(responseCode = "400", description = "La unidad está dada de baja", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "La unidad es de otro balneario", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe una unidad con ese identificador", content = @Content)
    })
    public ResponseEntity<RentalUnitResponse> updateBlockStatus(
            @PathVariable Long id,
            @RequestParam Boolean isBlocked) {
        return ResponseEntity.ok(rentalUnitService.updateBlockStatus(id, isBlocked));
    }

    @PreAuthorize("hasRole('ADMIN') and @unitAccess.belongsToResort(#id, principal.idManagedResort)")
    @PatchMapping("/{id}/retire")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Dar de baja una unidad (Admin)",
            description = "Definitivo, a diferencia del bloqueo. La unidad deja de verse en la ficha pública y en "
                    + "el plano, y no se puede reservar, bloquear, desbloquear ni cambiarle el precio. Sigue en "
                    + "GET /api/rental-units del administrador con retired en true, sus reservas pasadas quedan "
                    + "como estaban y su identificador sigue ocupado. Darla de baja otra vez no hace nada.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La unidad dada de baja, con retired en true"),
            @ApiResponse(responseCode = "400", description = "Tiene reservas pendientes o confirmadas que terminan hoy o después", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "La unidad es de otro balneario", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe una unidad con ese identificador", content = @Content)
    })
    public ResponseEntity<RentalUnitResponse> retire(@PathVariable Long id) {
        return ResponseEntity.ok(rentalUnitService.retire(id));
    }
}
