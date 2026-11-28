package com.zolea.backend.controllers;

import com.zolea.backend.dtos.resort.PhotoOrderRequest;
import com.zolea.backend.dtos.resort.ResortPhotoResponse;
import com.zolea.backend.models.ResortPhoto;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.services.ResortPhotoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.List;

/**
 * Las fotos del balneario (GH-67).
 *
 * <p>Subir, ordenar y borrar son del administrador, siempre sobre su balneario, que sale de la
 * sesión y nunca de un parámetro. Ver una foto es público.
 */
@RestController
@RequestMapping("/api/resorts")
@RequiredArgsConstructor
@Tag(name = "Balnearios", description = "CRUD de balnearios y gestión por parte del administrador")
public class ResortPhotoController {

    private final ResortPhotoService photoService;

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping(path = "/my/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Subir fotos de mi balneario (Admin)",
            description = "Una o varias fotos en la parte files del formulario, que se suman al final en el orden en "
                    + "que llegan. Van jpg, png o webp, de hasta 5 MB cada una, y el balneario puede tener hasta 10. "
                    + "Si una no sirve no se guarda ninguna, y el error dice cuál y por qué. Devuelve todas las "
                    + "fotos del balneario, en su orden.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Las fotos del balneario, con las nuevas al final"),
            @ApiResponse(responseCode = "400", description = "Ninguna foto, una que no es jpg, png ni webp, una de más de 5 MB o más de 10 fotos en total", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser el administrador de un balneario", content = @Content)
    })
    public ResponseEntity<List<ResortPhotoResponse>> upload(
            @AuthenticationPrincipal UserPrincipal principal,
            @Parameter(description = "Las fotos: jpg, png o webp, de hasta 5 MB cada una")
            @RequestPart(name = "files", required = false) List<MultipartFile> files) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(photoService.upload(principal.requireManagedResort(), files));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/my/photos/order")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Ordenar las fotos de mi balneario (Admin)",
            description = "Los ids de todas las fotos del balneario, cada uno una vez, en el orden nuevo. La primera "
                    + "es la portada.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Las fotos del balneario, en el orden nuevo"),
            @ApiResponse(responseCode = "400", description = "Falta una foto, sobra una que no es del balneario o se repite una", content = @Content),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser el administrador de un balneario", content = @Content)
    })
    public ResponseEntity<List<ResortPhotoResponse>> order(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody PhotoOrderRequest request) {
        return ResponseEntity.ok(photoService.order(principal.requireManagedResort(), request.photoIds()));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/my/photos/{photoId}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Borrar una foto de mi balneario (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "La foto se borró"),
            @ApiResponse(responseCode = "401", description = "Sin token, o con el token vencido", content = @Content),
            @ApiResponse(responseCode = "403", description = "Hace falta ser el administrador de un balneario", content = @Content),
            @ApiResponse(responseCode = "404", description = "La foto no existe, o es de otro balneario: la respuesta es la misma", content = @Content)
    })
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UserPrincipal principal, @PathVariable Long photoId) {
        photoService.delete(principal.requireManagedResort(), photoId);
        return ResponseEntity.noContent().build();
    }

    // Una foto no cambia nunca: ordenar cambia su lugar y borrarla la saca, pero la misma dirección
    // siempre trae la misma imagen. Por eso el navegador la puede guardar un año sin preguntar.
    @GetMapping("/{id}/photos/{photoId}")
    @Operation(summary = "Ver una foto de un balneario",
            description = "Público. La imagen tal como se subió, con su tipo y encabezados de caché.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La imagen", content = {
                    @Content(mediaType = "image/jpeg"), @Content(mediaType = "image/png"), @Content(mediaType = "image/webp")}),
            @ApiResponse(responseCode = "404", description = "La foto no existe, o no es de ese balneario", content = @Content)
    })
    public ResponseEntity<byte[]> view(@PathVariable Long id, @PathVariable Long photoId) {
        ResortPhoto photo = photoService.find(id, photoId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.getContentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .body(photo.getData());
    }
}
