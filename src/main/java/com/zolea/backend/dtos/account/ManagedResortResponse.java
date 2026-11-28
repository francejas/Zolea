package com.zolea.backend.dtos.account;

import com.zolea.backend.models.Resort;

/** El balneario que administra una cuenta: lo justo para nombrarlo. */
public record ManagedResortResponse(Long idResort, String name, boolean active) {

    public static ManagedResortResponse of(Resort resort) {
        return resort == null
                ? null
                : new ManagedResortResponse(resort.getIdResort(), resort.getName(), resort.isActive());
    }
}
