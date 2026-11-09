package com.zolea.backend.services;

import com.zolea.backend.dtos.amenity.AmenityResponse;
import com.zolea.backend.dtos.rentalunit.RentalUnitResponse;
import com.zolea.backend.dtos.resort.ResortRequest;
import com.zolea.backend.dtos.resort.ResortResponse;
import com.zolea.backend.exceptions.resort.ResortInvalidRegisterException;
import com.zolea.backend.exceptions.resort.ResortNotFoundException;
import com.zolea.backend.models.Amenity;
import com.zolea.backend.models.Resort;
import com.zolea.backend.repositories.AmenityRepository;
import com.zolea.backend.repositories.ResortRating;
import com.zolea.backend.repositories.ResortRepository;
import com.zolea.backend.repositories.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * <p><b>Transacciones:</b> la clase entera es de solo lectura y cada método que escribe lo declara.
 * Antes no había ninguna transacción declarada acá: el mapeo a DTO recorría colecciones LAZY fuera
 * de toda transacción y funcionaba únicamente porque {@code spring.jpa.open-in-view} dejaba la
 * sesión de base abierta durante toda la petición. Es decir, la transacción existía pero no la
 * había decidido nadie, y su límite lo ponía un filtro web.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ResortService {

    private final ResortRepository resortRepository;
    private final AmenityRepository amenityRepository;
    private final ReviewRepository reviewRepository;

    /**
     * Los balnearios que se le muestran a un visitante.
     *
     * <p>Solo los activos. Antes devolvía todos: el campo estaba en la base y en los endpoints de
     * activar y desactivar, pero ninguna consulta lo miraba, así que desactivar un balneario no
     * hacía nada visible.
     */
    public List<ResortResponse> getAll() {
        List<Resort> resorts = resortRepository.findByIsActiveTrue();
        Map<Long, ResortRating> ratings = ratingsOf(resorts.stream().map(Resort::getIdResort).toList());
        return resorts.stream()
                .map(r -> mapToResponse(r, ratings.get(r.getIdResort())))
                .toList();
    }

    /**
     * El promedio y la cantidad de reseñas de esos balnearios, en una sola consulta para todo el
     * listado. Un balneario sin reseñas no queda en el mapa.
     */
    private Map<Long, ResortRating> ratingsOf(List<Long> resortIds) {
        if (resortIds.isEmpty()) {
            return Map.of();
        }
        return reviewRepository.findRatingsByResort(resortIds).stream()
                .collect(Collectors.toMap(ResortRating::resortId, Function.identity()));
    }

    public ResortResponse getResortById(Long id) {
        Resort resort = resortRepository.findById(id)
                .orElseThrow(() -> new ResortNotFoundException("Resort with id " + id + " not found"));

        return mapToResponse(resort);
    }

    @Transactional
    public ResortResponse registerResort(ResortRequest request) {
        if (resortRepository.findByName(request.name()).isPresent()) {
            throw new ResortInvalidRegisterException("Resort with name " + request.name() + " already exists");
        }

        Resort resort = new Resort();
        resort.setName(request.name());
        resort.setLocation(request.location());
        resort.setAdminEmail(request.adminEmail());
        resort.setCoverPhotoUrl(request.coverPhotoUrl());
        resort.setDescription(request.description());
        resort.setActive(true);

        // Buscar y asignar amenities si enviaron la lista de IDs (notar que usamos request.amenityIds())
        if (request.amenityIds() != null && !request.amenityIds().isEmpty()) {
            List<Amenity> amenities = amenityRepository.findAllById(request.amenityIds());
            resort.setAmenities(amenities);
        }

        return mapToResponse(resortRepository.save(resort));
    }

    @Transactional
    public ResortResponse updateResort(Long resortId, ResortRequest request) {
        Resort resort = resortRepository.findById(resortId)
                .orElseThrow(() -> new ResortNotFoundException("Resort with id " + resortId + " not found"));

        applyChanges(resort, request);
        return mapToResponse(resortRepository.save(resort));
    }

    /**
     * Copia al balneario solo los campos que vinieron en el pedido.
     *
     * <p>Antes se asignaban todos sin mirar, así que un formulario que no mandara la foto o la
     * descripción las dejaba en {@code null} y la portada pública se quedaba sin imagen. Un
     * {@code PUT} incompleto no debería borrar lo que no menciona.
     */
    private void applyChanges(Resort resort, ResortRequest request) {
        if (request.name() != null && !request.name().isBlank()) {
            resort.setName(request.name());
        }
        if (request.location() != null && !request.location().isBlank()) {
            resort.setLocation(request.location());
        }
        if (request.adminEmail() != null && !request.adminEmail().isBlank()) {
            resort.setAdminEmail(request.adminEmail());
        }
        if (request.coverPhotoUrl() != null && !request.coverPhotoUrl().isBlank()) {
            resort.setCoverPhotoUrl(request.coverPhotoUrl());
        }
        if (request.description() != null && !request.description().isBlank()) {
            resort.setDescription(request.description());
        }
        if (request.amenityIds() != null) {
            resort.setAmenities(amenityRepository.findAllById(request.amenityIds()));
        }
    }

    public ResortResponse getMyResort(String adminEmail) {
        return mapToResponse(resortRepository.findByAdminEmail(adminEmail)
                .orElseThrow(() -> new ResortNotFoundException("No resort found for this admin")));
    }

    @Transactional
    public ResortResponse updateMyResort(String adminEmail, ResortRequest request) {
        Resort resort = resortRepository.findByAdminEmail(adminEmail)
                .orElseThrow(() -> new ResortNotFoundException("No resort found for this admin"));

        // El adminEmail NO se toca acá a propósito: este endpoint es "editar mi balneario", y
        // cambiarse el email de administrador por esta vía sería cambiar de dueño.
        String emailOriginal = resort.getAdminEmail();
        applyChanges(resort, request);
        resort.setAdminEmail(emailOriginal);

        return mapToResponse(resortRepository.save(resort));
    }

    @Transactional
    public ResortResponse toInactive(Long id) {
        Resort resort = resortRepository.findById(id).orElseThrow(() -> new ResortNotFoundException("Resort not found"));
        resort.setActive(false);
        return mapToResponse(resortRepository.save(resort));
    }

    @Transactional
    public ResortResponse toActive(Long id) {
        Resort resort = resortRepository.findById(id).orElseThrow(() -> new ResortNotFoundException("Resort not found"));
        resort.setActive(true);
        return mapToResponse(resortRepository.save(resort));
    }

    private ResortResponse mapToResponse(Resort r) {
        return mapToResponse(r, ratingsOf(List.of(r.getIdResort())).get(r.getIdResort()));
    }

    // MAPPER interno: Se encarga de transformar las listas anidadas de Resort a DTOs de Amenity y RentalUnit
    private ResortResponse mapToResponse(Resort r, ResortRating rating) {
        List<AmenityResponse> amenities = (r.getAmenities() != null) ? r.getAmenities().stream()
                                                                       .map(a -> new AmenityResponse(a.getIdAmenity(), a.getName()))
                                                                       .toList() : List.of();

        List<RentalUnitResponse> units = (r.getRentalUnits() != null) ? r.getRentalUnits().stream()
                                                                        .map(u -> new RentalUnitResponse(u.getIdRentalUnit(), u.getType(), u.getIdentifier(), u.getDailyPrice(), u.getIsBlocked(), r.getIdResort()))
                                                                        .toList() : List.of();

        return new ResortResponse(
                r.getIdResort(),
                r.getName(),
                r.getLocation(),
                r.getCoverPhotoUrl(),
                r.getDescription(),
                r.isActive(),
                amenities,
                units,
                // Sin reseñas, el promedio es null y no 0: un cero se leería como «lo calificaron mal».
                rating == null ? null
                        : BigDecimal.valueOf(rating.average()).setScale(1, RoundingMode.HALF_UP),
                rating == null ? 0 : rating.count()
        );
    }
}