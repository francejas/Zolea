package com.zolea.backend.controllers;

import com.zolea.backend.dtos.amenity.AmenityRequest;
import com.zolea.backend.dtos.amenity.AmenityResponse;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.services.AmenityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/amenities")
@RequiredArgsConstructor
@Tag(name = "Amenidades", description = "Servicios e instalaciones disponibles en los balnearios")
public class AmenityController {

    /**
     * El catálogo es uno solo para todos los balnearios, así que lo carga Zolea y no cada balneario
     * (15.7): crear, renombrar y borrar es solo de la cuenta de Zolea, un administrador sin balneario.
     * El rol lo exige el {@code @PreAuthorize}; el balneario, {@link UserPrincipal#requireZoleaAccount(String)},
     * antes de validar el pedido, para que un administrador de balneario reciba el motivo y no un 400.
     */
    private static final String DESCRIPCION_CATALOGO = "Solo la cuenta de Zolea, un administrador sin balneario. "
            + "Cada balneario elige los servicios que ofrece en PUT /api/resorts/my.";

    private static final String MOTIVO_CATALOGO = "Los servicios los carga Zolea. Elegí los tuyos en Mi balneario.";

    private final AmenityService amenityService;

    @GetMapping
    @Operation(summary = "Listar todas las amenidades", description = "Público.")
    public ResponseEntity<List<AmenityResponse>> getAllAmenities() {
        return ResponseEntity.ok(amenityService.getAllAmenities());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtener amenidad por ID", description = "Público.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El servicio pedido"),
            @ApiResponse(responseCode = "404", description = "No existe un servicio con ese identificador", content = @Content)
    })
    public ResponseEntity<AmenityResponse> getAmenityById(@PathVariable Long id) {
        return ResponseEntity.ok(amenityService.getAmenityById(id));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Crear amenidad (cuenta de Zolea)", description = DESCRIPCION_CATALOGO)
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "El servicio creado"),
            @ApiResponse(responseCode = "400", description = "El nombre viene vacío", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser la cuenta de Zolea. Un cliente, o el administrador de un balneario: «Los servicios los carga Zolea. Elegí los tuyos en Mi balneario.»", content = @Content)
    })
    public ResponseEntity<AmenityResponse> createAmenity(@RequestBody AmenityRequest request,
                                                         @AuthenticationPrincipal UserPrincipal principal) {
        principal.requireZoleaAccount(MOTIVO_CATALOGO);
        return new ResponseEntity<>(amenityService.createAmenity(request), HttpStatus.CREATED);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Actualizar amenidad (cuenta de Zolea)", description = DESCRIPCION_CATALOGO)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El servicio como quedó"),
            @ApiResponse(responseCode = "400", description = "El nombre viene vacío", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser la cuenta de Zolea. Un cliente, o el administrador de un balneario: «Los servicios los carga Zolea. Elegí los tuyos en Mi balneario.»", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe un servicio con ese identificador", content = @Content)
    })
    public ResponseEntity<AmenityResponse> updateAmenity(@PathVariable Long id, @RequestBody AmenityRequest request,
                                                         @AuthenticationPrincipal UserPrincipal principal) {
        principal.requireZoleaAccount(MOTIVO_CATALOGO);
        return ResponseEntity.ok(amenityService.updateAmenity(id, request));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Eliminar amenidad (cuenta de Zolea)", description = DESCRIPCION_CATALOGO)
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Borrado. Si algún balneario lo ofrecía, queda desvinculado"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser la cuenta de Zolea. Un cliente, o el administrador de un balneario: «Los servicios los carga Zolea. Elegí los tuyos en Mi balneario.»", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe un servicio con ese identificador", content = @Content)
    })
    public ResponseEntity<Void> deleteAmenity(@PathVariable Long id,
                                              @AuthenticationPrincipal UserPrincipal principal) {
        principal.requireZoleaAccount(MOTIVO_CATALOGO);
        amenityService.deleteAmenity(id);
        return ResponseEntity.noContent().build();
    }
}
