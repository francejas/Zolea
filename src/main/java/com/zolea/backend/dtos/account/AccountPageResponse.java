package com.zolea.backend.dtos.account;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.data.domain.Page;

import java.util.List;

/** Una página de la lista de usuarios (#72). */
public record AccountPageResponse(
        List<AccountSummaryResponse> content,
        @Schema(description = "La página, desde 0", example = "0")
        int page,
        @Schema(description = "Cuántas cuentas por página", example = "20")
        int size,
        @Schema(description = "Cuántas cuentas hay en total con esta búsqueda y este filtro", example = "42")
        long totalElements,
        int totalPages
) {

    public static AccountPageResponse of(Page<AccountSummaryResponse> page) {
        return new AccountPageResponse(page.getContent(), page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages());
    }
}
