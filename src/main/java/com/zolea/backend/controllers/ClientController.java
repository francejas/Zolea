package com.zolea.backend.controllers;

import com.zolea.backend.dtos.client.ClientRequest;
import com.zolea.backend.dtos.client.ClientResponse;
import com.zolea.backend.dtos.client.ResortClientResponse;
import com.zolea.backend.services.ClientService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import com.zolea.backend.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/clients")
@RequiredArgsConstructor
@Tag(name = "Clientes", description = "Registro y gestión de clientes")
public class ClientController {

    private final ClientService clientService;

    @PostMapping
    @Operation(summary = "Registrar cliente", description = "Público. Crea una nueva cuenta de cliente.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Cuenta creada"),
            @ApiResponse(responseCode = "400", description = "Faltan datos obligatorios o alguno tiene formato inválido: el detalle viene por campo", content = @Content),
            @ApiResponse(responseCode = "409", description = "Ya hay una cuenta con ese email, teléfono o DNI", content = @Content)
    })
    public ResponseEntity<ClientResponse> registerClient(@Valid @RequestBody ClientRequest request) {
        return new ResponseEntity<>(clientService.registerClient(request), HttpStatus.CREATED);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Listar los clientes de mi balneario (Admin)",
            description = "Quienes reservaron en el balneario del administrador, con su historial en ese balneario. "
                    + "Incluye a quienes reservaron por mostrador, que no tienen cuenta.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Los clientes del balneario del administrador"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta rol de administrador, o el administrador no tiene un balneario asignado", content = @Content)
    })
    public ResponseEntity<List<ResortClientResponse>> getAllClients(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(clientService.getClientsOfResort(principal.requireManagedResort()));
    }

    // Solo el propio perfil, también para un administrador: a sus clientes los ve en GET
    // /api/clients, y por acá habría leído y editado cualquier cuenta del sistema (RNF03).
    @PreAuthorize("#id == principal.idClient")
    @GetMapping("/{id}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Obtener cliente por ID")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El perfil del cliente"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "El perfil es de otra persona, aunque quien pide sea un administrador", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe un cliente con ese identificador", content = @Content)
    })
    public ResponseEntity<ClientResponse> getClientById(@PathVariable Long id) {
        return ResponseEntity.ok(clientService.getClientById(id));
    }

    // Solo el propio perfil, también para un administrador: a sus clientes los ve en GET
    // /api/clients, y por acá habría leído y editado cualquier cuenta del sistema (RNF03).
    @PreAuthorize("#id == principal.idClient")
    @PutMapping("/{id}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Actualizar datos del cliente")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "El perfil como quedó. Los campos que no vengan en el pedido no se tocan"),
            @ApiResponse(responseCode = "400", description = "Algún dato tiene formato inválido", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "El perfil es de otra persona, aunque quien pide sea un administrador", content = @Content),
            @ApiResponse(responseCode = "404", description = "No existe un cliente con ese identificador", content = @Content),
            @ApiResponse(responseCode = "409", description = "El email, el teléfono o el DNI ya son de otra cuenta", content = @Content)
    })
    public ResponseEntity<ClientResponse> updateClient(@PathVariable Long id,
                                                       @Valid @RequestBody ClientRequest request) {
        return ResponseEntity.ok(clientService.updateClient(id, request));
    }
}
