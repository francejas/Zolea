package com.zolea.backend.controllers;

import com.zolea.backend.dtos.account.AccountPageResponse;
import com.zolea.backend.dtos.account.AccountPasswordRequest;
import com.zolea.backend.dtos.account.AccountResponse;
import com.zolea.backend.dtos.account.AccountType;
import com.zolea.backend.dtos.account.ManagedResortRequest;
import com.zolea.backend.exceptions.client.AccountRequestInvalidException;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.services.AccountService;
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
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Los usuarios de la plataforma, solo para la cuenta de Zolea (#72). Un cliente recibe 403 por el
 * rol; el administrador de un balneario, por {@link UserPrincipal#requireZoleaAccount()}.
 *
 * <p>Los cuerpos se validan a mano, después de mirar quién pide: así quien no puede recibe el 403
 * aunque mande un pedido incompleto, y no un 400 que hable de los datos (como el alta de un
 * balneario, #71).
 */
@RestController
@RequestMapping("/api/accounts")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Usuarios", description = "Las cuentas de la plataforma, para la cuenta de Zolea")
public class AccountController {

    private final AccountService accountService;
    private final Validator validator;

    @GetMapping
    @Operation(summary = "Listar las cuentas (cuenta de Zolea)",
            description = "Todas las cuentas, activas y desactivadas, ordenadas por apellido y nombre. "
                    + "Se busca por nombre, email o DNI, y se filtra por tipo.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Una página de cuentas"),
            @ApiResponse(responseCode = "401", description = "Sin token, con el token vencido o con la cuenta desactivada", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser la cuenta de Zolea", content = @Content)
    })
    public ResponseEntity<AccountPageResponse> search(
            @AuthenticationPrincipal UserPrincipal principal,
            @Parameter(description = "Parte del nombre, el email o el DNI", example = "romero")
            @RequestParam(required = false) String q,
            @Parameter(description = "El tipo de cuenta; sin mandar, todas")
            @RequestParam(required = false) AccountType type,
            @Parameter(description = "La página, desde 0", example = "0")
            @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Cuántas por página, hasta 100", example = "20")
            @RequestParam(defaultValue = "20") int size) {
        principal.requireZoleaAccount();
        return ResponseEntity.ok(accountService.search(q, type, page, size));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Ver una cuenta (cuenta de Zolea)",
            description = "Sus datos, el balneario que administra, cuántas reservas hizo y si está activa.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La cuenta"),
            @ApiResponse(responseCode = "401", description = "Sin token, con el token vencido o con la cuenta desactivada", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser la cuenta de Zolea", content = @Content),
            @ApiResponse(responseCode = "404", description = "La cuenta no existe", content = @Content)
    })
    public ResponseEntity<AccountResponse> getAccount(@AuthenticationPrincipal UserPrincipal principal,
                                                      @PathVariable Long id) {
        principal.requireZoleaAccount();
        return ResponseEntity.ok(accountService.getAccount(id));
    }

    @PatchMapping("/{id}/inactive")
    @Operation(summary = "Desactivar una cuenta (cuenta de Zolea)",
            description = "No ingresa más, y su token deja de valer en el pedido siguiente. Sus reservas siguen.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La cuenta como quedó"),
            @ApiResponse(responseCode = "400", description = "Es la propia cuenta de Zolea", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, con el token vencido o con la cuenta desactivada", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser la cuenta de Zolea", content = @Content),
            @ApiResponse(responseCode = "404", description = "La cuenta no existe", content = @Content)
    })
    public ResponseEntity<AccountResponse> deactivate(@AuthenticationPrincipal UserPrincipal principal,
                                                      @PathVariable Long id) {
        principal.requireZoleaAccount();
        return ResponseEntity.ok(accountService.deactivate(id, principal.idClient()));
    }

    @PatchMapping("/{id}/active")
    @Operation(summary = "Reactivar una cuenta (cuenta de Zolea)", description = "Vuelve a ingresar.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La cuenta como quedó"),
            @ApiResponse(responseCode = "401", description = "Sin token, con el token vencido o con la cuenta desactivada", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser la cuenta de Zolea", content = @Content),
            @ApiResponse(responseCode = "404", description = "La cuenta no existe", content = @Content)
    })
    public ResponseEntity<AccountResponse> activate(@AuthenticationPrincipal UserPrincipal principal,
                                                    @PathVariable Long id) {
        principal.requireZoleaAccount();
        return ResponseEntity.ok(accountService.activate(id));
    }

    @PutMapping("/{id}/password")
    @Operation(summary = "Ponerle una contraseña provisoria (cuenta de Zolea)",
            description = "Reemplaza la que tenía. La persona ingresa con esta y la cambia en Mi cuenta.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "La contraseña quedó puesta"),
            @ApiResponse(responseCode = "400", description = "Falta la contraseña: el detalle viene en campos", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, con el token vencido o con la cuenta desactivada", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser la cuenta de Zolea", content = @Content),
            @ApiResponse(responseCode = "404", description = "La cuenta no existe", content = @Content)
    })
    public ResponseEntity<Void> setTemporaryPassword(@AuthenticationPrincipal UserPrincipal principal,
                                                     @PathVariable Long id,
                                                     @RequestBody AccountPasswordRequest request) {
        principal.requireZoleaAccount();
        validate(request);
        accountService.setTemporaryPassword(id, request.password());
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/managed-resort")
    @Operation(summary = "Hacerla administradora de un balneario (cuenta de Zolea)",
            description = "Pasa a ser ADMIN de ese balneario y lo ve en Mi balneario. Si ya administraba otro, pasa a este.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La cuenta como quedó"),
            @ApiResponse(responseCode = "400", description = "Falta el balneario, o es la propia cuenta de Zolea", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, con el token vencido o con la cuenta desactivada", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser la cuenta de Zolea", content = @Content),
            @ApiResponse(responseCode = "404", description = "La cuenta o el balneario no existen", content = @Content)
    })
    public ResponseEntity<AccountResponse> assignResort(@AuthenticationPrincipal UserPrincipal principal,
                                                        @PathVariable Long id,
                                                        @RequestBody ManagedResortRequest request) {
        principal.requireZoleaAccount();
        validate(request);
        return ResponseEntity.ok(accountService.assignResort(id, request.idResort(), principal.idClient()));
    }

    @DeleteMapping("/{id}/managed-resort")
    @Operation(summary = "Quitarle el balneario (cuenta de Zolea)", description = "Vuelve a ser una cuenta de cliente.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La cuenta como quedó"),
            @ApiResponse(responseCode = "400", description = "No administra ningún balneario, o es la propia cuenta de Zolea", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, con el token vencido o con la cuenta desactivada", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser la cuenta de Zolea", content = @Content),
            @ApiResponse(responseCode = "404", description = "La cuenta no existe", content = @Content)
    })
    public ResponseEntity<AccountResponse> removeResort(@AuthenticationPrincipal UserPrincipal principal,
                                                        @PathVariable Long id) {
        principal.requireZoleaAccount();
        return ResponseEntity.ok(accountService.removeResort(id, principal.idClient()));
    }

    private <T> void validate(T request) {
        Set<ConstraintViolation<T>> violations = validator.validate(request);
        if (violations.isEmpty()) return;
        Map<String, String> fields = new LinkedHashMap<>();
        violations.forEach(v -> fields.putIfAbsent(v.getPropertyPath().toString(), v.getMessage()));
        throw new AccountRequestInvalidException(fields);
    }
}
