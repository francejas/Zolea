package com.zolea.backend.dtos.client;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Los datos de la cuenta de un administrador de balneario, como los carga la cuenta de Zolea (#71).
 * La contraseña es provisoria: el administrador ingresa con ella y después la cambia en Mi cuenta.
 */
public record AdminAccountRequest(
        @Schema(description = "Nombre", example = "Laura")
        @NotBlank(message = "Escribí el nombre.")
        String firstName,

        @Schema(description = "Apellido", example = "Gómez")
        @NotBlank(message = "Escribí el apellido.")
        String lastName,

        @Schema(description = "Email, con el que va a ingresar. No puede ser de otra cuenta", example = "laura.gomez@pinamar.com")
        @NotBlank(message = "Escribí el email.")
        @Email(message = "El email no tiene un formato válido.")
        String email,

        @Schema(description = "Teléfono. No puede ser de otra cuenta", example = "+54 2254 123456")
        @NotBlank(message = "Escribí el teléfono.")
        String phone,

        @Schema(description = "DNI, sin puntos. No puede ser de otra cuenta", example = "30111222")
        @NotBlank(message = "Escribí el DNI.")
        @Pattern(regexp = "\\d{7,8}", message = "El DNI son 7 u 8 números, sin puntos.")
        String dni,

        @Schema(description = "Contraseña provisoria, para su primer ingreso", example = "provisoria1")
        @NotBlank(message = "Escribí una contraseña provisoria.")
        String password
) {
}
